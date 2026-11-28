import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : [join(directory, entry.name)],
  );

const sources = files(join(process.cwd(), 'src')).filter(
  (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'),
);

const parse = (file: string) =>
  ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

describe('Module and persistence boundaries', () => {
  it('keeps persistence out of controllers and guards', () => {
    const violations: string[] = [];
    for (const file of sources.filter((file) =>
      /\.(controller|guard)\.ts$/.test(file),
    )) {
      const source = parse(file);
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          [
            'query',
            'getRepository',
            'createQueryBuilder',
            'findOne',
            'findOneBy',
            'save',
            'transaction',
          ].includes(node.expression.name.text)
        )
          violations.push(
            relative(process.cwd(), file) + ': ' + node.expression.name.text,
          );
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(violations).toEqual([]);
  });
  it('uses standard TypeORM repositories and confines native execution to infrastructure', () => {
    const violations: string[] = [];
    for (const file of sources) {
      const name = relative(process.cwd(), file).replaceAll('\\', '/');
      if (name.includes('/migrations/')) continue;
      if (name.includes('/repositories/')) violations.push(name);
      const source = parse(file);
      function visit(node: ts.Node) {
        if (
          ts.isClassDeclaration(node) &&
          node.name?.text.endsWith('Repository')
        )
          violations.push(name + ': custom repository');
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'query' &&
          ![
            'src/health/health.service.ts',
            'src/database/password-recovery.store.ts',
            // The durable push queue uses PostgreSQL row claims and a serialized device registry.
            'src/database/delivery-push.store.ts',
            'src/common/transactions/transaction-locks.service.ts',
          ].includes(name)
        )
          violations.push(name + ': native execution');
        if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text.endsWith('Service')
        )
          violations.push(name + ': manual provider');
        if (node.kind === ts.SyntaxKind.AnyKeyword)
          violations.push(name + ': any');
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(violations).toEqual([]);
  }, 15000);
  it('registers each service and guard in exactly one owner module', () => {
    const owners = new Map<string, string[]>();
    for (const file of sources.filter((f) => f.endsWith('.module.ts'))) {
      const source = parse(file);
      function visit(node: ts.Node) {
        if (
          ts.isPropertyAssignment(node) &&
          node.name.getText(source) === 'providers' &&
          ts.isArrayLiteralExpression(node.initializer)
        )
          for (const value of node.initializer.elements)
            if (ts.isIdentifier(value)) {
              const list = owners.get(value.text) ?? [];
              list.push(file);
              owners.set(value.text, list);
            }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect([...owners].filter(([, modules]) => modules.length !== 1)).toEqual(
      [],
    );
    expect(owners.get('DeliveryExpiryService')).toHaveLength(1);
    expect(owners.get('RedemptionExpiryService')).toHaveLength(1);
  });
  it('has no circular module imports', () => {
    const graph = new Map<string, string[]>();
    for (const file of sources.filter((f) => f.endsWith('.module.ts'))) {
      const source = parse(file),
        imports = new Map<string, string>();
      for (const declaration of source.statements.filter(
        ts.isImportDeclaration,
      )) {
        const bindings = declaration.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings))
          for (const binding of bindings.elements)
            imports.set(
              binding.name.text,
              ts.isStringLiteral(declaration.moduleSpecifier)
                ? declaration.moduleSpecifier.text
                : '',
            );
      }
      const targets: string[] = [];
      function visit(node: ts.Node) {
        if (
          ts.isPropertyAssignment(node) &&
          node.name.getText(source) === 'imports' &&
          ts.isArrayLiteralExpression(node.initializer)
        )
          for (const value of node.initializer.elements)
            if (ts.isIdentifier(value) && imports.has(value.text)) {
              const spec = imports.get(value.text)!;
              if (spec.startsWith('.'))
                targets.push(join(file, '..', spec).replace(/\.js$/, '.ts'));
            }
        ts.forEachChild(node, visit);
      }
      visit(source);
      graph.set(file, targets);
    }
    const complete = new Set<string>();
    function visit(file: string, stack: string[]) {
      expect(
        stack.includes(file),
        stack
          .concat(file)
          .map((f) => relative(process.cwd(), f))
          .join(' -> '),
      ).toBe(false);
      if (complete.has(file)) return;
      for (const dep of graph.get(file) ?? []) visit(dep, [...stack, file]);
      complete.add(file);
    }
    for (const file of graph.keys()) visit(file, []);
  });
  it('keeps one controller or DTO class per file', () => {
    for (const file of sources.filter(
      (f) => f.endsWith('.controller.ts') || f.endsWith('.dto.ts'),
    )) {
      const classes = parse(file).statements.filter(ts.isClassDeclaration);
      expect(classes.length, file).toBeLessThanOrEqual(1);
    }
  });
});

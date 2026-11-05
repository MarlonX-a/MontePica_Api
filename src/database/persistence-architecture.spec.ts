import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : [join(directory, entry.name)],
  );
}
const sourceFiles = files(join(process.cwd(), 'src')).filter(
  (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'),
);
describe('Persistence boundaries', () => {
  it('keeps SQL and ORM operations inside repositories and explicit infrastructure exceptions', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      const name = relative(process.cwd(), file).replaceAll('\\', '/');
      if (
        name.includes('/repositories/') ||
        name.includes('/migrations/') ||
        name === 'src/health/health.service.ts'
      )
        continue;
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          [
            'query',
            'getRepository',
            'createQueryBuilder',
            'createEntityManager',
          ].includes(node.expression.name.text)
        )
          violations.push(`${name}: ${node.expression.name.text}`);
        if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
          const value = ts.isTemplateExpression(node)
            ? node.head.text
            : node.text;
          if (
            /^\s*(SELECT\s|INSERT\s+INTO\s|UPDATE\s+\w+\s+SET\s|DELETE\s+FROM\s|FROM\s+\w+\s+(JOIN|WHERE)\s)/i.test(
              value,
            )
          )
            violations.push(`${name}: SQL literal`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(violations).toEqual([]);
  });
  it('keeps transaction ownership outside repositories and forbids generic SQL entrypoints', () => {
    const violations: string[] = [];
    for (const file of sourceFiles.filter((f) =>
      f.replaceAll('\\', '/').includes('/repositories/'),
    )) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        if (node.kind === ts.SyntaxKind.AnyKeyword)
          violations.push(`${file}: any`);
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          [
            'transaction',
            'startTransaction',
            'commitTransaction',
            'rollbackTransaction',
          ].includes(node.expression.name.text)
        )
          violations.push(`${file}: nested transaction`);
        if (
          ts.isMethodDeclaration(node) &&
          !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)
        ) {
          if (
            node.name.getText(source) === 'query' ||
            node.parameters.some((p) =>
              /^fragment\d+$/.test(p.name.getText(source)),
            )
          )
            violations.push(`${file}: public SQL interface`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(violations).toEqual([]);
  });
});

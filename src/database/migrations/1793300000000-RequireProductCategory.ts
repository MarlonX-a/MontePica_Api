import { MigrationInterface, QueryRunner } from 'typeorm';

export class RequireProductCategory1793300000000 implements MigrationInterface {
  name = 'RequireProductCategory1793300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const uncategorized = await queryRunner.query(
      'SELECT count(*)::int AS total FROM "producto" WHERE "id_categoria" IS NULL',
    );
    if (uncategorized[0].total > 0) {
      throw new Error(
        'No se puede exigir categoría: asigna una categoría a cada producto sin categoría y vuelve a ejecutar la migración.',
      );
    }

    await queryRunner.query(
      'ALTER TABLE "producto" ALTER COLUMN "id_categoria" SET NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "producto" ALTER COLUMN "id_categoria" DROP NOT NULL',
    );
  }
}

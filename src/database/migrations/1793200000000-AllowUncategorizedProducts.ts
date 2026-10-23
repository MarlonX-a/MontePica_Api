import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowUncategorizedProducts1793200000000 implements MigrationInterface {
  name = 'AllowUncategorizedProducts1793200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "producto" ALTER COLUMN "id_categoria" DROP NOT NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const categories = await queryRunner.query('SELECT "id_categoria" FROM "categoria" ORDER BY "orden", "id_categoria" LIMIT 1');
    if (categories.length === 0) {
      const uncategorized = await queryRunner.query('SELECT count(*)::int AS total FROM "producto" WHERE "id_categoria" IS NULL');
      if (uncategorized[0].total > 0) throw new Error('No se puede revertir: crea una categoría antes de reasignar productos sin categoría.');
    } else {
      await queryRunner.query('UPDATE "producto" SET "id_categoria" = $1 WHERE "id_categoria" IS NULL', [categories[0].id_categoria]);
    }
    await queryRunner.query('ALTER TABLE "producto" ALTER COLUMN "id_categoria" SET NOT NULL');
  }
}

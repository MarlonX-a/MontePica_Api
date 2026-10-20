import 'reflect-metadata';
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import dataSource from './data-source.js';
import { hashPassword, normalizeEmail, normalizePhone } from '../auth/password.util.js';

async function hidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') throw new Error('Ejecuta admin:create desde una terminal interactiva.');
  stdout.write(prompt);
  stdin.setRawMode(true); stdin.resume();
  return new Promise((resolve, reject) => {
    let answer = '';
    const finish = (error?: Error) => {
      stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n');
      if (error) reject(error);
      else resolve(answer);
    };
    const onData = (chunk: Buffer) => {
      const key = chunk.toString('utf8');
      if (key === '\u0003') return finish(new Error('Cancelado.'));
      if (key === '\r' || key === '\n') return finish();
      if (key === '\u0008' || key === '\u007f') answer = answer.slice(0, -1);
      else if (!key.startsWith('\u001b') && key >= ' ') answer += key;
    };
    stdin.on('data', onData);
  });
}

const rl = createInterface({ input: stdin, output: stdout });
try {
  if (!stdin.isTTY) throw new Error('Ejecuta admin:create desde una terminal interactiva.');
  const name = (await rl.question('Nombre completo: ')).trim().normalize('NFC').replace(/\s+/g, ' ');
  const email = normalizeEmail(await rl.question('Correo: '));
  const phoneInput = (await rl.question('Teléfono opcional (Enter para omitir): ')).trim();
  const phone = phoneInput ? normalizePhone(phoneInput) : null;
  const password = await hidden('Contraseña inicial (mínimo 8, una mayúscula y un número): ');
  const confirmation = await hidden('Confirma la contraseña: ');
  if (name.length < 1 || name.length > 160) throw new Error('El nombre debe tener entre 1 y 160 caracteres.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw new Error('El correo no es válido.');
  if (password !== confirmation) throw new Error('Las contraseñas no coinciden.');
  if (password.length < 8 || password.length > 128 || !/[A-ZÁÉÍÓÚÜÑ]/.test(password) || !/\d/.test(password)) {
    throw new Error('La contraseña no cumple los requisitos.');
  }
  const passwordHash = await hashPassword(password);
  await dataSource.initialize();
  await dataSource.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(71920403)');
    const admins = await manager.query(`SELECT count(*)::int AS total FROM usuario u JOIN rol r ON r.id_rol=u.id_rol WHERE r.codigo='admin'`);
    if (admins[0].total > 0) throw new Error('Ya existe un usuario administrador; el comando no modifica cuentas existentes.');
    const duplicate = await manager.query('SELECT 1 FROM usuario WHERE correo_normalizado=$1', [email]);
    if (duplicate.length) throw new Error('El correo ya está registrado.');
    const role = await manager.query("SELECT id_rol FROM rol WHERE codigo='admin'");
    if (!role[0]) throw new Error('No existe el rol admin. Ejecuta primero las migraciones.');
    const inserted = await manager.query('INSERT INTO usuario(id_rol,correo_normalizado,password_hash,activo) VALUES($1,$2,$3,true) RETURNING id_usuario', [role[0].id_rol,email,passwordHash]);
    const id = inserted[0].id_usuario;
    await manager.query('INSERT INTO perfil(id_usuario,nombres,apellidos,telefono) VALUES($1,$2,NULL,$3)', [id,name,phone]);
    await manager.query(`INSERT INTO auditoria(actor_usuario_id,actor_tipo,recurso_tipo,recurso_id,evento,detalle)
      VALUES(NULL,'sistema','usuario',$1,'users.bootstrap_admin_created','{}'::jsonb)`, [id]);
  });
  console.info('Administrador creado. Inicia sesión desde POST /api/v1/auth/login.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo crear el administrador.');
  process.exitCode = 1;
} finally {
  rl.close();
  if (dataSource.isInitialized) await dataSource.destroy();
}

import 'dotenv/config';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import 'reflect-metadata';
import {
  hashPassword,
  normalizeEmail,
  normalizePhone,
} from '../auth/password.util.js';
import dataSource from './data-source.js';
import { AuditRepository } from './repositories/audit.repository.js';
import { BootstrapRepository } from './repositories/bootstrap.repository.js';
const bootstrap = new BootstrapRepository();

async function hidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function')
    throw new Error('Ejecuta admin:create desde una terminal interactiva.');
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let answer = '';
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
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
  if (!stdin.isTTY)
    throw new Error('Ejecuta admin:create desde una terminal interactiva.');
  const name = (await rl.question('Nombre completo: '))
    .trim()
    .normalize('NFC')
    .replace(/\s+/g, ' ');
  const email = normalizeEmail(await rl.question('Correo: '));
  const phoneInput = (
    await rl.question('Teléfono opcional (Enter para omitir): ')
  ).trim();
  const phone = phoneInput ? normalizePhone(phoneInput) : null;
  const password = await hidden(
    'Contraseña inicial (mínimo 8, una mayúscula y un número): ',
  );
  const confirmation = await hidden('Confirma la contraseña: ');
  if (name.length < 1 || name.length > 160)
    throw new Error('El nombre debe tener entre 1 y 160 caracteres.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320)
    throw new Error('El correo no es válido.');
  if (password !== confirmation)
    throw new Error('Las contraseñas no coinciden.');
  if (
    password.length < 8 ||
    password.length > 128 ||
    !/[A-ZÁÉÍÓÚÜÑ]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new Error('La contraseña no cumple los requisitos.');
  }
  const passwordHash = await hashPassword(password);
  await dataSource.initialize();
  await dataSource.transaction(async (manager) => {
    await bootstrap.lockAdministratorCreation(manager);
    const admins = await bootstrap.countAdministrators(manager);
    if (admins > 0)
      throw new Error(
        'Ya existe un usuario administrador; el comando no modifica cuentas existentes.',
      );
    const duplicate = await bootstrap.emailExists(manager, email);
    if (duplicate) throw new Error('El correo ya está registrado.');
    const role = await bootstrap.findAdministratorRole(manager);
    if (!role)
      throw new Error(
        'No existe el rol admin. Ejecuta primero las migraciones.',
      );
    const id = await bootstrap.insertAdministrator(
      manager,
      role,
      email,
      passwordHash,
    );

    await bootstrap.insertProfile(manager, id, name, phone);
    await new AuditRepository().append(
      manager,
      {},
      'usuario',
      id,
      'users.bootstrap_admin_created',
      {},
      'sistema',
    );
  });
  console.info(
    'Administrador creado. Inicia sesión desde POST /api/v1/auth/login.',
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'No se pudo crear el administrador.',
  );
  process.exitCode = 1;
} finally {
  rl.close();
  if (dataSource.isInitialized) await dataSource.destroy();
}

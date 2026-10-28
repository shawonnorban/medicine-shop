import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { requirePerm } from '../../lib/auth.js';

export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? 'uploads');

// Decide the type from the file's own bytes, never from the name or the client's header.
function sniff(b: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

export async function uploadRoutes(app: FastifyInstance) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  app.post('/uploads', { preHandler: requirePerm('products.write') }, async (req, reply) => {
    const file = await req.file({ limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
    if (!file) return reply.status(400).send({ error: 'no_file' });
    const buf = await file.toBuffer(); // throws on size limit
    if (file.file.truncated) return reply.status(413).send({ error: 'file_too_large' });
    const ext = sniff(buf);
    if (!ext) return reply.status(415).send({ error: 'unsupported_image' });
    const name = `${randomBytes(12).toString('hex')}.${ext}`;
    writeFileSync(join(UPLOAD_DIR, name), buf);
    return reply.status(201).send({ url: `/uploads/${name}` });
  });
}

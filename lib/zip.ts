import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Archive .zip minimale (compression deflate, sans dossiers ni dates) : de quoi
 * livrer l'extension en un fichier, sans dependance. Format : en-tete local et
 * donnees de chaque fichier, puis repertoire central, puis enregistrement de fin
 * (APPNOTE.TXT, sections 4.3.7, 4.3.12 et 4.3.16).
 */

export type ZipEntry = { name: string; data: Buffer };

// 01/01/1980 00:00, la plus petite date MS-DOS : l'archive ne depend pas du jour.
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

// Zip classique, sans extension Zip64 : champs sur 16 et 32 bits.
const MAX_ENTRIES = 0xffff;
const MAX_SIZE = 0xffffffff;

function signature(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

export function createZip(entries: ZipEntry[]): Buffer {
  if (entries.length > MAX_ENTRIES) throw new Error('Trop de fichiers pour une archive zip');
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const fileName = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    if (fileName.length > 0xffff || data.length > MAX_SIZE || offset > MAX_SIZE) {
      throw new Error(`Fichier trop grand pour une archive zip : ${name}`);
    }

    // Champs communs aux en-tetes local et central (octets 4 a 29 du local) :
    // version requise, drapeaux, methode, heure, date, CRC, tailles, nom.
    const common = Buffer.alloc(26);
    common.writeUInt16LE(20, 0); // version requise
    common.writeUInt16LE(0x0800, 2); // noms en UTF-8
    common.writeUInt16LE(8, 4); // deflate
    common.writeUInt16LE(DOS_DATE, 8); // heure (octets 6-7) laissee a zero
    common.writeUInt32LE(crc, 10);
    common.writeUInt32LE(compressed.length, 14);
    common.writeUInt32LE(data.length, 18);
    common.writeUInt16LE(fileName.length, 22);
    // octets 24-25 : champ extra, vide

    const local = Buffer.concat([signature(0x04034b50), common]);
    locals.push(local, fileName, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version auteur
    common.copy(central, 6);
    // commentaire, disque, attributs : a zero.
    central.writeUInt32LE(offset, 42);
    centrals.push(central, fileName);

    offset += local.length + fileName.length + compressed.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); // entrees sur ce disque
  end.writeUInt16LE(entries.length, 10); // entrees au total
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}

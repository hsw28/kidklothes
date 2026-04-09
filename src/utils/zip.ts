import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

type ZipEntryInput = {
  path: string;
  data?: Uint8Array;
  isDirectory?: boolean;
  modifiedAt?: Date;
};

type ZipCentralDirectoryEntry = {
  path: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  localHeaderOffset: number;
  isDirectory: boolean;
};

const textEncoder = new TextEncoder();

const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORED_METHOD = 0;
const MAX_EOCD_SCAN_BYTES = 65557;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let current = i;
    for (let bit = 0; bit < 8; bit += 1) {
      current = (current & 1) !== 0 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    table[i] = current >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let current = 0xffffffff;
  for (const value of bytes) {
    current = crcTable[(current ^ value) & 0xff] ^ (current >>> 8);
  }
  return (current ^ 0xffffffff) >>> 0;
};

const toDosDateTime = (date: Date) => {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
};

const writeUint16 = (view: DataView, offset: number, value: number) => view.setUint16(offset, value & 0xffff, true);
const writeUint32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value >>> 0, true);

const joinUri = (baseUri: string, name: string) => `${baseUri.replace(/\/+$/, '')}/${name.replace(/^\/+/, '')}`;

const normalizeEntryPath = (input: string): string => {
  const normalized = input.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').filter(Boolean);
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new Error('Backup zip contains an unsafe path.');
    }
  }
  return segments.join('/');
};

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const readUint16 = (bytes: Uint8Array, offset: number): number => new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
const readUint32 = (bytes: Uint8Array, offset: number): number => new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);

export const createStoredZip = (entries: ZipEntryInput[]): Uint8Array => {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const entryPath = normalizeEntryPath(entry.path);
    const isDirectory = entry.isDirectory ?? entryPath.endsWith('/');
    const finalPath = isDirectory ? (entryPath.endsWith('/') ? entryPath : `${entryPath}/`) : entryPath;
    const nameBytes = textEncoder.encode(finalPath);
    const dataBytes = isDirectory ? new Uint8Array(0) : (entry.data ?? new Uint8Array(0));
    const checksum = crc32(dataBytes);
    const modifiedAt = toDosDateTime(entry.modifiedAt ?? new Date());

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, ZIP_LOCAL_FILE_HEADER_SIGNATURE);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, ZIP_UTF8_FLAG);
    writeUint16(localView, 8, ZIP_STORED_METHOD);
    writeUint16(localView, 10, modifiedAt.time);
    writeUint16(localView, 12, modifiedAt.date);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, dataBytes.length);
    writeUint32(localView, 22, dataBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, ZIP_UTF8_FLAG);
    writeUint16(centralView, 10, ZIP_STORED_METHOD);
    writeUint16(centralView, 12, modifiedAt.time);
    writeUint16(centralView, 14, modifiedAt.date);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, dataBytes.length);
    writeUint32(centralView, 24, dataBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, isDirectory ? 0x10 : 0);
    writeUint32(centralView, 42, localOffset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    localOffset += localHeader.length + dataBytes.length;
  }

  const localBytes = concatBytes(localParts);
  const centralBytes = concatBytes(centralParts);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  writeUint32(eocdView, 0, ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE);
  writeUint16(eocdView, 4, 0);
  writeUint16(eocdView, 6, 0);
  writeUint16(eocdView, 8, entries.length);
  writeUint16(eocdView, 10, entries.length);
  writeUint32(eocdView, 12, centralBytes.length);
  writeUint32(eocdView, 16, localBytes.length);
  writeUint16(eocdView, 20, 0);

  return concatBytes([localBytes, centralBytes, eocd]);
};

const findEndOfCentralDirectoryOffset = (zipBytes: Uint8Array): number => {
  const start = Math.max(0, zipBytes.length - MAX_EOCD_SCAN_BYTES);
  for (let offset = zipBytes.length - 22; offset >= start; offset -= 1) {
    if (readUint32(zipBytes, offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw new Error('Backup zip is invalid.');
};

const parseCentralDirectory = (zipBytes: Uint8Array): ZipCentralDirectoryEntry[] => {
  const eocdOffset = findEndOfCentralDirectoryOffset(zipBytes);
  const entryCount = readUint16(zipBytes, eocdOffset + 10);
  const centralDirectoryOffset = readUint32(zipBytes, eocdOffset + 16);
  const entries: ZipCentralDirectoryEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(zipBytes, offset) !== ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
      throw new Error('Backup zip central directory is invalid.');
    }
    const compressionMethod = readUint16(zipBytes, offset + 10);
    const compressedSize = readUint32(zipBytes, offset + 20);
    const uncompressedSize = readUint32(zipBytes, offset + 24);
    const fileNameLength = readUint16(zipBytes, offset + 28);
    const extraFieldLength = readUint16(zipBytes, offset + 30);
    const fileCommentLength = readUint16(zipBytes, offset + 32);
    const localHeaderOffset = readUint32(zipBytes, offset + 42);
    const rawName = zipBytes.slice(offset + 46, offset + 46 + fileNameLength);
    const path = normalizeEntryPath(new TextDecoder().decode(rawName));
    const isDirectory = path.endsWith('/');
    entries.push({
      path,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      crc32: readUint32(zipBytes, offset + 16),
      localHeaderOffset,
      isDirectory,
    });
    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
};

const ensureParentDirectories = async (rootUri: string, relativePath: string) => {
  const segments = relativePath.split('/').filter(Boolean);
  if (segments.length <= 1) return;
  let currentUri = rootUri.replace(/\/+$/, '');
  for (const segment of segments.slice(0, -1)) {
    currentUri = `${currentUri}/${segment}`;
    await LegacyFileSystem.makeDirectoryAsync(`${currentUri}/`, { intermediates: true }).catch(() => undefined);
  }
};

export const extractStoredZipToDirectory = async (zipBytes: Uint8Array, destinationDirectoryUri: string): Promise<string[]> => {
  await LegacyFileSystem.makeDirectoryAsync(destinationDirectoryUri, { intermediates: true });
  const entries = parseCentralDirectory(zipBytes);
  const extractedPaths: string[] = [];

  for (const entry of entries) {
    if (entry.compressionMethod !== ZIP_STORED_METHOD) {
      throw new Error('This backup zip uses an unsupported compression method.');
    }

    const localOffset = entry.localHeaderOffset;
    if (readUint32(zipBytes, localOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error('Backup zip file header is invalid.');
    }

    const fileNameLength = readUint16(zipBytes, localOffset + 26);
    const extraFieldLength = readUint16(zipBytes, localOffset + 28);
    const dataOffset = localOffset + 30 + fileNameLength + extraFieldLength;
    const rawData = zipBytes.slice(dataOffset, dataOffset + entry.compressedSize);
    const targetUri = joinUri(destinationDirectoryUri, entry.path);

    if (entry.isDirectory) {
      await LegacyFileSystem.makeDirectoryAsync(`${targetUri.replace(/\/+$/, '')}/`, { intermediates: true });
      extractedPaths.push(targetUri);
      continue;
    }

    if (crc32(rawData) !== entry.crc32) {
      throw new Error('Backup zip is corrupted.');
    }

    await ensureParentDirectories(destinationDirectoryUri, entry.path);
    const targetFile = new File(targetUri);
    targetFile.create({ intermediates: true, overwrite: true });
    targetFile.write(rawData);
    extractedPaths.push(targetUri);
  }

  return extractedPaths;
};

export const readFileBytes = async (uri: string): Promise<Uint8Array> => new File(uri).bytes();

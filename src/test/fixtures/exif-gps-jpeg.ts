function littleEndian16(value: number) {
  return [value & 0xff, (value >> 8) & 0xff];
}

function littleEndian32(value: number) {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

function rational(numerator: number, denominator = 1) {
  return [...littleEndian32(numerator), ...littleEndian32(denominator)];
}

export function createExifGpsJpeg() {
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, ...littleEndian32(8),
    ...littleEndian16(1),
    0x25, 0x88, 0x04, 0x00, ...littleEndian32(1), ...littleEndian32(26),
    ...littleEndian32(0),
    ...littleEndian16(4),
    0x01, 0x00, 0x02, 0x00, ...littleEndian32(2), 0x4e, 0x00, 0x00, 0x00,
    0x02, 0x00, 0x05, 0x00, ...littleEndian32(3), ...littleEndian32(80),
    0x03, 0x00, 0x02, 0x00, ...littleEndian32(2), 0x57, 0x00, 0x00, 0x00,
    0x04, 0x00, 0x05, 0x00, ...littleEndian32(3), ...littleEndian32(104),
    ...littleEndian32(0),
    ...rational(42), ...rational(21), ...rational(36),
    ...rational(71), ...rational(3), ...rational(36),
  ];
  const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const appLength = exif.length + 2;
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, (appLength >> 8) & 0xff, appLength & 0xff,
    ...exif,
    0xff, 0xd9,
  ]);
}

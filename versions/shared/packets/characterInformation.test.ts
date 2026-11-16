import { describe, expect, it } from 'vitest';
import { CharacterInformationPacket } from './ServerToClientPackets';

// PMSG_CHARMAPJOINRESULT (WSclient.cpp): MapNumber is one byte and the character's direction the next.
// Read as one 16-bit value, a character facing anything but 0 entered map (dir << 8) | map: Noria facing 3 was 771.
describe('CharacterInformation', () => {
  it('reads the map as one byte, the direction beside it', () => {
    const packet = CharacterInformationPacket.createPacket();
    const view = packet.buffer;
    view.setUint8(4, 175);
    view.setUint8(5, 113);
    view.setUint8(6, 3);
    view.setUint8(7, 3);

    expect([packet.X, packet.Y, packet.MapId, packet.Direction]).toEqual([175, 113, 3, 3]);
  });
});

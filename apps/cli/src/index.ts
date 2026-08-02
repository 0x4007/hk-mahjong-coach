#!/usr/bin/env node

const usage = `Hong Kong Mahjong Coach

Usage:
  mahjong play
  mahjong serve --stdio --seat player-0
  mahjong replay <game-or-hand-id>
  mahjong analyze --hand "1m 2m 3m ..."
  mahjong drill tiles
  mahjong rules list
  mahjong profile show
`;

process.stdout.write(usage);

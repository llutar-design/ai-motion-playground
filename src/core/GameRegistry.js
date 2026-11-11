// 새 게임은 src/games에 만들고 이 배열에 한 줄만 추가하면 메뉴에 나타난다.
import { BalloonPop } from '../games/BalloonPop.js';
import { StarCatch } from '../games/StarCatch.js';
import { DodgeRunner } from '../games/DodgeRunner.js';
import { PoseMaster } from '../games/PoseMaster.js';
import { FruitSlice } from '../games/FruitSlice.js';
import { MagicShield } from '../games/MagicShield.js';
import { FishCatch } from '../games/FishCatch.js';
import { MathChallenge } from '../games/MathChallenge.js';
import { TreasureDig } from '../games/TreasureDig.js';
import { CoopChallenge } from '../games/CoopChallenge.js';
import { RhythmChallenge } from '../games/RhythmChallenge.js';
import { RobotCopy } from '../games/RobotCopy.js';

export const GAMES = [
  BalloonPop, StarCatch, DodgeRunner, PoseMaster, FruitSlice, MagicShield,
  FishCatch, MathChallenge, TreasureDig, CoopChallenge, RhythmChallenge, RobotCopy,
];

export const gameById = (id) => GAMES.find((g) => g.meta.id === id);

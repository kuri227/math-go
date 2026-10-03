import Phaser from "phaser";
import { BootScene } from "./BootScene";
import { PlayScene } from "./PlayScene";

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#101b3d",
    transparent: false,
    render: { antialias: true, pixelArt: false },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth,
      height: parent.clientHeight,
    },
    scene: [BootScene, PlayScene],
    audio: { noAudio: true },
  });
}


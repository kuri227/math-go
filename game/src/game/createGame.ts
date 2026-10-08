import Phaser from "phaser";
import { BootScene } from "./BootScene";
import { PlayScene } from "./PlayScene";

export function createGame(parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#101b3d",
    transparent: false,
    render: { antialias: true, pixelArt: false },
    dom: { createContainer: true },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth,
      height: parent.clientHeight,
    },
    scene: [BootScene, PlayScene],
    audio: { noAudio: true },
  });
  // HUD wrapping, fullscreen and view changes can resize the parent without
  // a window resize. Keep the canvas and DOM coordinate system in sync.
  const observer = new ResizeObserver(() => {
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width > 0 && height > 0 && (width !== game.scale.width || height !== game.scale.height)) {
      // RESIZE mode derives its size from parentSize during refresh. That cache
      // may still be zero after a result/setup view temporarily hid the parent.
      game.scale.getParentBounds();
      game.scale.resize(width, height);
    }
  });
  observer.observe(parent);
  game.events.once(Phaser.Core.Events.DESTROY, () => observer.disconnect());
  return game;
}


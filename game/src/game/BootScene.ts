import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    // Asset loading and audio initialization can be added here without touching PlayScene.
    this.scene.start("play");
  }
}


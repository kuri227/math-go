import Phaser from "phaser";
import { gameEvents } from "../events";
import type { Question } from "../domain/types";

interface QuestionEvent extends CustomEvent {
  detail: { question: Question; current: number; total: number };
}

export class PlayScene extends Phaser.Scene {
  private instruction!: Phaser.GameObjects.Text;
  private expression!: Phaser.GameObjects.Text;
  private progress!: Phaser.GameObjects.Text;
  private meta!: Phaser.GameObjects.Text;
  private rule!: Phaser.GameObjects.Rectangle;
  private backdrop!: Phaser.GameObjects.Graphics;

  constructor() {
    super("play");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#101b3d");
    this.backdrop = this.add.graphics();
    this.progress = this.add.text(0, 0, "", {
      fontFamily: '"M PLUS 1 Variable", sans-serif',
      fontSize: "16px",
      fontStyle: "600",
      color: "#94a9da",
    });
    this.meta = this.add.text(0, 0, "", {
      fontFamily: '"M PLUS 1 Variable", sans-serif',
      fontSize: "12px",
      fontStyle: "700",
      color: "#9ee8d8",
      letterSpacing: 1.5,
    }).setOrigin(1, 0);
    this.instruction = this.add.text(0, 0, "", {
      fontFamily: '"M PLUS 1 Variable", sans-serif',
      fontSize: "26px",
      fontStyle: "700",
      color: "#f5f1e8",
      align: "center",
    }).setOrigin(0.5);
    this.expression = this.add.text(0, 0, "", {
      fontFamily: '"M PLUS 1 Variable", sans-serif',
      fontSize: "52px",
      fontStyle: "700",
      color: "#ffffff",
      align: "center",
    }).setOrigin(0.5);
    this.rule = this.add.rectangle(0, 0, 120, 4, 0xf05d3b).setOrigin(0.5);

    gameEvents.addEventListener("question", this.onQuestion as EventListener);
    gameEvents.addEventListener("submitted", this.onSubmitted);
    this.scale.on("resize", this.layout, this);
    this.layout();
    gameEvents.dispatchEvent(new Event("scene-ready"));
  }

  shutdown(): void {
    gameEvents.removeEventListener("question", this.onQuestion as EventListener);
    gameEvents.removeEventListener("submitted", this.onSubmitted);
  }

  private readonly onQuestion = (event: QuestionEvent): void => {
    const { question, current, total } = event.detail;
    this.progress.setText(`ROUND ${String(current).padStart(2, "0")} / ${String(total).padStart(2, "0")}`);
    this.meta.setText(`${question.difficulty}  ·  ${question.category}`);
    this.instruction.setText(question.instruction);
    this.expression.setText(question.display);
    this.expression.setScale(0.96);
    this.tweens.add({
      targets: this.expression,
      scale: 1,
      duration: 420,
      ease: "Expo.Out",
    });
  };

  private readonly onSubmitted = (): void => {
    this.tweens.add({
      targets: this.rule,
      scaleX: { from: 1, to: 1.7 },
      alpha: { from: 1, to: 0.45 },
      yoyo: true,
      duration: 230,
      ease: "Expo.Out",
    });
  };

  private layout(): void {
    const width = this.scale.width;
    const mobile = width < 640;
    const height = mobile ? 215 : 260;
    this.backdrop.clear();
    this.backdrop.fillStyle(0x101b3d, 1).fillRect(0, 0, width, height);
    this.backdrop.lineStyle(1, 0x31416d, 0.42);
    const spacing = mobile ? 44 : 58;
    for (let x = -height; x < width + height; x += spacing) {
      this.backdrop.lineBetween(x, height, x + height, 0);
    }
    this.backdrop.fillStyle(0x17264e, 0.9).fillCircle(width * 0.5, height * 0.55, mobile ? 112 : 148);
    this.backdrop.lineStyle(1, 0x426099, 0.35).strokeCircle(width * 0.5, height * 0.55, mobile ? 88 : 116);
    this.progress.setPosition(mobile ? 22 : 42, mobile ? 28 : 34);
    this.meta.setPosition(width - (mobile ? 22 : 42), mobile ? 30 : 37);
    this.instruction
      .setPosition(width / 2, mobile ? 82 : 92)
      .setFontSize(mobile ? 20 : 26)
      .setWordWrapWidth(width - (mobile ? 44 : 120));
    this.expression
      .setPosition(width / 2, mobile ? 142 : 164)
      .setFontSize(mobile ? 38 : 52);
    this.rule.setPosition(width / 2, mobile ? 190 : 224);
  }
}


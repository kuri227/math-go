import Phaser from "phaser";
import katex from "katex";
import { gameEvents } from "../events";
import { formulaScale } from "./formulaLayout";
import type { Question } from "../domain/types";

interface QuestionEvent extends CustomEvent {
  detail: { question: Question; current: number; total: number };
}

interface UrgencyEvent extends CustomEvent {
  detail: { ratio: number; urgent: boolean };
}

export class PlayScene extends Phaser.Scene {
  private instruction!: Phaser.GameObjects.Text;
  private expression!: Phaser.GameObjects.DOMElement;
  private progress!: Phaser.GameObjects.Text;
  private meta!: Phaser.GameObjects.Text;
  private rule!: Phaser.GameObjects.Rectangle;
  private backdrop!: Phaser.GameObjects.Graphics;
  private remainingRatio = 1;
  private formulaObserver?: ResizeObserver;
  private availableFormulaWidth = 1;
  private availableFormulaHeight = 1;
  private questionKey = "";

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
    const expressionElement = document.createElement("div");
    expressionElement.className = "stage-expression";
    expressionElement.setAttribute("aria-hidden", "true");
    // Measure the complete equation; CSS max-width would hide overflow from Phaser.
    expressionElement.style.width = "max-content";
    expressionElement.style.maxWidth = "none";
    expressionElement.style.whiteSpace = "nowrap";
    this.expression = this.add.dom(0, 0, expressionElement).setOrigin(0.5);
    this.rule = this.add.rectangle(0, 0, 120, 4, 0xf05d3b).setOrigin(0.5);

    gameEvents.addEventListener("question", this.onQuestion as EventListener);
    gameEvents.addEventListener("submitted", this.onSubmitted);
    gameEvents.addEventListener("urgency", this.onUrgency as EventListener);
    this.scale.on("resize", this.layout, this);
    // clamp() fonts and asynchronously loaded fonts change DOM dimensions too.
    this.formulaObserver = new ResizeObserver(() => {
      if (expressionElement.clientWidth > 0 && expressionElement.clientHeight > 0) this.layout();
    });
    this.formulaObserver.observe(expressionElement);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.layout();
    gameEvents.dispatchEvent(new Event("scene-ready"));
  }

  shutdown(): void {
    this.formulaObserver?.disconnect();
    this.scale.off("resize", this.layout, this);
    gameEvents.removeEventListener("question", this.onQuestion as EventListener);
    gameEvents.removeEventListener("submitted", this.onSubmitted);
    gameEvents.removeEventListener("urgency", this.onUrgency as EventListener);
  }

  private readonly onQuestion = (event: QuestionEvent): void => {
    const { question, current, total } = event.detail;
    const key = JSON.stringify([question, current, total]);
    if (key === this.questionKey) return;
    this.questionKey = key;
    this.progress.setText(`ROUND ${String(current).padStart(2, "0")} / ${String(total).padStart(2, "0")}`);
    this.meta.setText(`${question.difficulty_label}  ·  ${question.category}`);
    this.instruction.setText(question.instruction);
    this.expression.setScale(1);
    this.remainingRatio = 1;
    katex.render(question.display_latex, this.expression.node as HTMLElement, {
      displayMode: true,
      throwOnError: false,
      strict: "ignore",
    });
    this.expression.updateSize().setOrigin(0.5);
    this.layout();
  };

  private readonly onUrgency = (event: UrgencyEvent): void => {
    this.remainingRatio = Phaser.Math.Clamp(event.detail.ratio, 0, 1);
    this.applyFormulaScale();
    (this.expression.node as HTMLElement).classList.toggle("is-urgent", event.detail.urgent);
    this.rule.setFillStyle(event.detail.urgent ? 0xffd166 : 0xf05d3b);
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
    const height = this.scale.height;
    const shortStage = height < 240;
    const instructionY = shortStage
      ? Math.max(38, height * 0.3)
      : mobile
        ? Math.min(90, height * 0.2)
        : Math.min(110, height * 0.24);
    this.instruction
      .setPosition(width / 2, instructionY)
      .setFontSize(shortStage ? 16 : mobile ? 20 : 26)
      .setWordWrapWidth(width - (mobile ? 44 : 120));
    const formulaTop = instructionY + this.instruction.displayHeight / 2 + 16;
    const status = this.game.canvas.parentElement?.closest(".display-stage")?.querySelector<HTMLElement>(".display-status");
    const formulaBottom = status
      ? height - status.offsetHeight - 24 - 16
      : height - (shortStage ? 32 : mobile ? 47 : 52);
    const maximumHeight = Math.max(1, Math.min(mobile ? 145 : 170, height * 0.36, formulaBottom - formulaTop));
    const preferredY = Phaser.Math.Clamp(
      height * (shortStage ? 0.68 : 0.56),
      shortStage ? 92 : mobile ? 145 : 180,
      height - (shortStage ? 26 : mobile ? 48 : 64),
    );
    const expressionY = formulaBottom > formulaTop
      ? Phaser.Math.Clamp(preferredY, formulaTop + maximumHeight / 2, formulaBottom - maximumHeight / 2)
      : (formulaTop + formulaBottom) / 2;
    this.backdrop.clear();
    this.backdrop.fillStyle(0x101b3d, 1).fillRect(0, 0, width, height);
    this.backdrop.lineStyle(1, 0x31416d, 0.42);
    const spacing = mobile ? 44 : 58;
    for (let x = -height; x < width + height; x += spacing) {
      this.backdrop.lineBetween(x, height, x + height, 0);
    }
    const circleRadius = shortStage ? 72 : mobile ? 112 : 148;
    this.backdrop.fillStyle(0x17264e, 0.9).fillCircle(width * 0.5, expressionY, circleRadius);
    this.backdrop.lineStyle(1, 0x426099, 0.35).strokeCircle(width * 0.5, expressionY, circleRadius * 0.78);
    this.progress.setPosition(mobile ? 22 : 42, shortStage ? 14 : mobile ? 28 : 34);
    this.meta.setPosition(width - (mobile ? 22 : 42), shortStage ? 16 : mobile ? 30 : 37);
    this.expression.setPosition(width / 2, expressionY);
    this.rule.setPosition(width / 2, height - (shortStage ? 12 : mobile ? 27 : 32));
    this.availableFormulaWidth = Math.max(1, width - (mobile ? 44 : 64));
    this.availableFormulaHeight = Math.max(1, Math.min(
      mobile ? 145 : 170,
      height * 0.36,
      2 * (expressionY - instructionY - this.instruction.displayHeight / 2 - 16),
      2 * (this.rule.y - expressionY - 20),
      2 * (formulaBottom - expressionY),
    ));
    // Phaser's DOM renderer centers using cached width/height. Refresh them
    // whenever the viewport/container/font changes, not just on a new question.
    if ((this.expression.node as HTMLElement).clientWidth > 0) {
      this.expression.updateSize().setOrigin(0.5);
    }
    this.applyFormulaScale();
  }

  private applyFormulaScale(): void {
    this.expression.setScale(formulaScale(
      this.expression.width,
      this.expression.height,
      this.availableFormulaWidth,
      this.availableFormulaHeight,
      this.remainingRatio,
    ));
  }
}


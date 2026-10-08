import "./course-guide.css";
import type { CourseConfig } from "../domain/courses";
import { courseGuideContent } from "./courseGuideContent";

export class CourseGuide {
  readonly element = document.createElement("section");
  private readonly start: HTMLButtonElement;
  private readonly status: HTMLElement;

  constructor(parent: HTMLElement, dualScreen: boolean, onStart: () => void, onBack: () => void) {
    this.element.className = "course-guide";
    this.element.hidden = true;
    this.element.setAttribute("aria-labelledby", "guideTitle");
    this.element.innerHTML = `
      <div class="guide-layout">
        <header class="guide-heading">
          <button type="button" class="guide-back">設定に戻る</button>
          <h1 id="guideTitle" tabindex="-1"></h1>
          <p class="guide-description"></p>
          <p class="guide-difficulty"></p>
        </header>
        <section class="guide-play" aria-labelledby="guidePlayHeading">
          <h2 id="guidePlayHeading">遊び方</h2>
          <ol>
            <li><strong>問題を見る</strong><p>${dualScreen ? "モニターに出る問題を解こう。" : "画面に出る問題を解こう。"}</p></li>
            <li><strong>答えを書く</strong><p>${dualScreen ? "液タブ" : "白い入力欄"}に答えを大きく書き、「回答を提出」。</p></li>
            <li><strong>判定を確認する</strong><p>読み取りが違ったら「書き直す」。確認できたら「次の問題へ」。</p></li>
          </ol>
          <p class="guide-result-note">正解数と連続正解を記録。最後に正解率も確認できます。</p>
        </section>
        <section class="guide-rules" aria-labelledby="guideRulesHeading">
          <h2 id="guideRulesHeading">このモードのルール</h2>
          <dl>
            <div><dt>問題数</dt><dd class="guide-count"></dd></div>
            <div><dt>制限時間</dt><dd class="guide-time"></dd></div>
            <div><dt>残機</dt><dd class="guide-lives"></dd></div>
          </dl>
          <p class="guide-timing"></p>
          <div class="guide-ending"><h3>ゲームが終わるとき</h3><p class="guide-end-condition"></p><p class="guide-penalty"></p></div>
        </section>
        <footer class="guide-actions">
          <p class="guide-status" role="status"></p>
          <button type="button" class="guide-start">ゲームを開始</button>
        </footer>
      </div>`;
    parent.append(this.element);
    this.start = this.find<HTMLButtonElement>(".guide-start");
    this.status = this.find(".guide-status");
    this.start.addEventListener("click", onStart);
    this.find<HTMLButtonElement>(".guide-back").addEventListener("click", onBack);
  }

  open(course: CourseConfig, difficulty: string): void {
    const content = courseGuideContent(course);
    const fields: Record<string, string> = {
      "#guideTitle": content.name,
      ".guide-description": content.description,
      ".guide-difficulty": `${difficulty}までの問題を出題`,
      ".guide-count": content.questionCount,
      ".guide-time": content.time,
      ".guide-lives": content.lives,
      ".guide-timing": content.timing,
      ".guide-end-condition": content.ending,
      ".guide-penalty": content.penalty,
    };
    for (const [selector, text] of Object.entries(fields)) this.find(selector).textContent = text;
    this.element.hidden = false;
    this.find("#guideTitle").focus();
    window.scrollTo({ top: 0 });
  }

  hide(): void { this.element.hidden = true; }

  setReadiness(ready: boolean, message: string): void {
    this.start.disabled = !ready;
    this.status.textContent = message;
  }

  private find<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.element.querySelector<T>(selector);
    if (!element) throw new Error(`Missing guide element: ${selector}`);
    return element;
  }
}

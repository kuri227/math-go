const form = document.querySelector("#questionForm");
const saveButton = document.querySelector("#saveButton");
const formStatus = document.querySelector("#formStatus");
const bankCount = document.querySelector("#bankCount");
const questionLatex = document.querySelector("#questionLatex");
const previewLatex = document.querySelector("#previewLatex");
const previewInstruction = document.querySelector("#previewInstruction");
const previewAnswer = document.querySelector("#previewAnswer");

function value(name) {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement
    ? field.value.trim()
    : "";
}

function createQuestionId() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
    String(now.getMilliseconds()).padStart(3, "0"),
  ].join("");
  return `custom-${stamp}`;
}

function answers() {
  return [...new Set(value("answer").split(/\r?\n/).map((answer) => answer.trim()).filter(Boolean))];
}

function updatePreview() {
  previewLatex.textContent = value("question_latex") || "数式を入力してください";
  previewInstruction.textContent = value("instruction") || "指示を入力してください";
  previewAnswer.textContent = `正答: ${answers()[0] || "未入力"}`;
}

async function refreshCount() {
  try {
    const response = await fetch("/api/v1/questions", { cache: "no-store" });
    if (!response.ok) throw new Error();
    const questions = await response.json();
    bankCount.textContent = `現在 ${questions.length} 問`;
  } catch {
    bankCount.textContent = "問題数を取得できません";
  }
}

form.addEventListener("input", updatePreview);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const acceptedAnswers = answers();
  if (acceptedAnswers.length === 0) {
    formStatus.dataset.state = "error";
    formStatus.textContent = "正答を1つ以上入力してください。";
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "保存中…";
  formStatus.dataset.state = "";
  formStatus.textContent = "問題データを確認しています。";
  const payload = {
    id: value("id") || createQuestionId(),
    question: value("question"),
    question_latex: value("question_latex"),
    instruction: value("instruction"),
    answer: acceptedAnswers,
    description: value("description"),
    difficulty: Number(value("difficulty")),
    category: value("category"),
  };

  try {
    const response = await fetch("/api/v1/admin/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.detail || `HTTP ${response.status}`);
    formStatus.dataset.state = "success";
    formStatus.textContent = `${body.message}（全${body.total}問）`;
    const preservedDifficulty = value("difficulty");
    form.reset();
    form.elements.namedItem("difficulty").value = preservedDifficulty;
    form.elements.namedItem("instruction").value = "計算しなさい";
    questionLatex.focus();
    updatePreview();
    await refreshCount();
  } catch (error) {
    formStatus.dataset.state = "error";
    formStatus.textContent = error instanceof Error ? `登録できませんでした: ${error.message}` : "登録できませんでした。";
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "この問題を登録";
  }
});

updatePreview();
void refreshCount();

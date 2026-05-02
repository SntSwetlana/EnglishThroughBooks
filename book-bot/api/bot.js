const { Telegraf, Markup } = require("telegraf");
const lessons = require("../lessons.json");

const bot = new Telegraf(process.env.BOT_TOKEN);

function getLesson(id) {
  return lessons[id];
}

function lessonMenu() {
  return Markup.inlineKeyboard(
    Object.entries(lessons).map(([id, lesson]) => [
      Markup.button.callback(`📖 ${lesson.title}`, `lesson:${id}`)
    ])
  );
}

function lessonKeyboard(lessonId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🧩 Quizlet", `quizlet:${lessonId}`)],
    [Markup.button.callback("✅ Practice", `q:${lessonId}:0`)],
    [Markup.button.callback("⬅️ Lessons", "lessons")]
  ]);
}

function questionKeyboard(lessonId, qIndex, question) {
  return Markup.inlineKeyboard(
    question.options.map((option, optionIndex) => [
      Markup.button.callback(option, `a:${lessonId}:${qIndex}:${optionIndex}`)
    ])
  );
}

bot.start(async (ctx) => {
  const payload = ctx.startPayload;

  if (payload && getLesson(payload)) {
    const lesson = getLesson(payload);
    return ctx.reply(
      `📖 ${lesson.title}\nLevel: ${lesson.level}`,
      lessonKeyboard(payload)
    );
  }

  await ctx.reply("📚 Choose a lesson:", lessonMenu());
});

bot.action("lessons", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("📚 Choose a lesson:", lessonMenu());
});

bot.action(/^lesson:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const lesson = getLesson(lessonId);

  await ctx.editMessageText(
    `📖 ${lesson.title}\nLevel: ${lesson.level}`,
    lessonKeyboard(lessonId)
  );
});

bot.action(/^quizlet:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const lesson = getLesson(lessonId);

  const text =
    `🧩 Quizlet\n\n` +
    lesson.quizlet
      .map(([en, ru]) => `• ${en} — ${ru}`)
      .join("\n");

  await ctx.editMessageText(text, lessonKeyboard(lessonId));
});

bot.action(/^q:(.+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const qIndex = Number(ctx.match[2]);
  const lesson = getLesson(lessonId);
  const question = lesson.questions[qIndex];

  if (!question) {
    return ctx.editMessageText(
      `🏁 Practice finished!\n\nGreat work.`,
      lessonKeyboard(lessonId)
    );
  }

  await ctx.editMessageText(
    `✅ Question ${qIndex + 1}/${lesson.questions.length}\n\n${question.question}`,
    questionKeyboard(lessonId, qIndex, question)
  );
});

bot.action(/^a:(.+):(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const qIndex = Number(ctx.match[2]);
  const optionIndex = Number(ctx.match[3]);

  const lesson = getLesson(lessonId);
  const question = lesson.questions[qIndex];

  const isCorrect = optionIndex === question.answer;

  const resultText = isCorrect
    ? `✅ Correct!\n\n💡 ${question.explanation}`
    : `❌ Not quite.\n\nCorrect answer: ${question.options[question.answer]}\n\n💡 ${question.explanation}`;

  await ctx.editMessageText(
    resultText,
    Markup.inlineKeyboard([
      [Markup.button.callback("➡️ Next", `q:${lessonId}:${qIndex + 1}`)],
      [Markup.button.callback("⬅️ Lesson", `lesson:${lessonId}`)]
    ])
  );
});

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Bot is running.");
  }

  try {
    await bot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error");
  }
};
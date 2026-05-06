const { Telegraf, Markup } = require("telegraf");
const lessons = require("../lessons.json");

const bot = new Telegraf(process.env.BOT_TOKEN);

function getLesson(id) {
  return lessons[id];
}

function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function boldQuizletPhrases(text, quizlet) {
  if (!text) return "📖 Text will be added soon.";

  let markedText = text;

  for (const [phrase] of quizlet) {
    const cleanPhrase = phrase.trim();
    if (!cleanPhrase) continue;

    const escaped = cleanPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");

    markedText = markedText.replace(regex, (match) => `<b>${match}</b>`);
  }

  return markedText;
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
    [Markup.button.callback("📖 Read excerpt", `text:${lessonId}`)],
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
      `📖 <b>${escapeHtml(lesson.title)}</b>\nLevel: ${escapeHtml(lesson.level)}`,
      {
        parse_mode: "HTML",
        reply_markup: lessonKeyboard(payload).reply_markup
      }
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

  if (!lesson) {
    return ctx.editMessageText("Lesson not found.");
  }

  await ctx.editMessageText(
    `📖 <b>${escapeHtml(lesson.title)}</b>\nLevel: ${escapeHtml(lesson.level)}`,
    {
      parse_mode: "HTML",
      reply_markup: lessonKeyboard(lessonId).reply_markup
    }
  );
});

bot.action(/^text:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const lesson = getLesson(lessonId);

  if (!lesson) {
    return ctx.editMessageText("Lesson not found.");
  }

  const markedText = boldQuizletPhrases(lesson.text, lesson.quizlet);

  await ctx.editMessageText(markedText, {
    parse_mode: "HTML",
    reply_markup: lessonKeyboard(lessonId).reply_markup
  });
});

bot.action(/^quizlet:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const lesson = getLesson(lessonId);

  if (!lesson) {
    return ctx.editMessageText("Lesson not found.");
  }

  const text =
    `🧩 <b>Quizlet</b>\n\n` +
    lesson.quizlet
      .map(([en, ru]) => `• <b>${escapeHtml(en.trim())}</b>\n  ${escapeHtml(ru.trim())}`)
      .join("\n\n");

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: lessonKeyboard(lessonId).reply_markup
  });
});

bot.action(/^q:(.+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const qIndex = Number(ctx.match[2]);
  const lesson = getLesson(lessonId);

  if (!lesson) {
    return ctx.editMessageText("Lesson not found.");
  }

  const question = lesson.questions[qIndex];

  if (!question) {
    return ctx.editMessageText(
      `🏁 <b>Practice finished!</b>\n\nGreat work.`,
      {
        parse_mode: "HTML",
        reply_markup: lessonKeyboard(lessonId).reply_markup
      }
    );
  }

  await ctx.editMessageText(
    `✅ <b>Question ${qIndex + 1}/${lesson.questions.length}</b>\n\n${escapeHtml(question.question)}`,
    {
      parse_mode: "HTML",
      reply_markup: questionKeyboard(lessonId, qIndex, question).reply_markup
    }
  );
});

bot.action(/^a:(.+):(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const qIndex = Number(ctx.match[2]);
  const optionIndex = Number(ctx.match[3]);

  const lesson = getLesson(lessonId);

  if (!lesson) {
    return ctx.editMessageText("Lesson not found.");
  }

  const question = lesson.questions[qIndex];
  const isCorrect = optionIndex === question.answer;

  const resultText = isCorrect
    ? `✅ <b>Correct!</b>\n\n💡 ${escapeHtml(question.explanation)}`
    : `❌ <b>Not quite.</b>\n\nCorrect answer: <b>${escapeHtml(question.options[question.answer])}</b>\n\n💡 ${escapeHtml(question.explanation)}`;

  await ctx.editMessageText(resultText, {
    parse_mode: "HTML",
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback("➡️ Next", `q:${lessonId}:${qIndex + 1}`)],
      [Markup.button.callback("⬅️ Lesson", `lesson:${lessonId}`)]
    ]).reply_markup
  });
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
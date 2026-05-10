const { Telegraf, Markup } = require("telegraf");
const lessons = require("../lessons.json");

const bot = new Telegraf(process.env.BOT_TOKEN);

const LEVELS = ["B2", "C1", "C2"];

function getLesson(id) {
  return lessons[id];
}

function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRegExp(text = "") {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLevelQuizlet(lesson, level = "C1") {
  return lesson?.levels?.[level]?.quizlet || [];
}

function boldQuizletPhrases(text, quizlet) {
  if (!text) return "📖 Text will be added soon.";

  let markedText = escapeHtml(text);

  for (const item of quizlet) {
    const phrase = item[2] || item[0]; // если есть match — используем его
    const cleanPhrase = phrase?.trim();
    if (!cleanPhrase) continue;

    const escapedPhrase = escapeHtml(cleanPhrase);
    const regex = new RegExp(escapeRegExp(escapedPhrase), "gi");

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
    [
      Markup.button.callback("📖 Text B2", `text:${lessonId}:B2`),
      Markup.button.callback("📖 Text C1", `text:${lessonId}:C1`),
      Markup.button.callback("📖 Text C2", `text:${lessonId}:C2`)
    ],
    [
      Markup.button.callback("🟦 B2 Quizlet", `quizlet:${lessonId}:B2`),
      Markup.button.callback("🟪 C1 Quizlet", `quizlet:${lessonId}:C1`),
      Markup.button.callback("🟥 C2 Quizlet", `quizlet:${lessonId}:C2`)
    ],
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

function lessonHeader(lesson) {
  return `📖 <b>${escapeHtml(lesson.title)}</b>\nLevel: ${escapeHtml(lesson.level || "B2/C1/C2")}`;
}

bot.start(async (ctx) => {
  const payload = ctx.startPayload;

  if (payload && getLesson(payload)) {
    const lesson = getLesson(payload);

    return ctx.reply(lessonHeader(lesson), {
      parse_mode: "HTML",
      reply_markup: lessonKeyboard(payload).reply_markup
    });
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

  await ctx.editMessageText(lessonHeader(lesson), {
    parse_mode: "HTML",
    reply_markup: lessonKeyboard(lessonId).reply_markup
  });
});

bot.action(/^text:([^:]+):(B2|C1|C2)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const level = ctx.match[2];
  const lesson = getLesson(lessonId);

  if (!lesson) {
    return ctx.editMessageText("Lesson not found.");
  }

  const quizlet = getLevelQuizlet(lesson, level);
  const markedText = boldQuizletPhrases(lesson.text, quizlet);

  await ctx.editMessageText(
    `📖 <b>${escapeHtml(level)} text focus</b>\n\n${markedText}`,
    {
      parse_mode: "HTML",
      reply_markup: lessonKeyboard(lessonId).reply_markup
    }
  );
});

bot.action(/^quizlet:([^:]+):(B2|C1|C2)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const level = ctx.match[2];
  const lesson = getLesson(lessonId);

  if (!lesson) {
    return ctx.editMessageText("Lesson not found.");
  }

  const quizlet = getLevelQuizlet(lesson, level);

  if (!quizlet.length) {
    return ctx.editMessageText(`🧩 No ${level} Quizlet yet.`, {
      parse_mode: "HTML",
      reply_markup: lessonKeyboard(lessonId).reply_markup
    });
  }

  const text =
    `🧩 <b>${escapeHtml(level)} Quizlet</b>\n\n` +
    quizlet
      .map(([en, ru]) => `• <b>${escapeHtml(en.trim())}</b>\n  ${escapeHtml(ru.trim())}`)
      .join("\n\n");

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: lessonKeyboard(lessonId).reply_markup
  });
});

bot.action(/^q:([^:]+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const qIndex = Number(ctx.match[2]);
  const lesson = getLesson(lessonId);

  if (!lesson) {
    return ctx.editMessageText("Lesson not found.");
  }

  const questions = lesson.questions || [];
  const question = questions[qIndex];

  if (!question) {
    return ctx.editMessageText("🏁 <b>Practice finished!</b>\n\nGreat work.", {
      parse_mode: "HTML",
      reply_markup: lessonKeyboard(lessonId).reply_markup
    });
  }

  await ctx.editMessageText(
    `✅ <b>Question ${qIndex + 1}/${questions.length}</b>\n\n${escapeHtml(question.question)}`,
    {
      parse_mode: "HTML",
      reply_markup: questionKeyboard(lessonId, qIndex, question).reply_markup
    }
  );
});

bot.action(/^a:([^:]+):(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const qIndex = Number(ctx.match[2]);
  const optionIndex = Number(ctx.match[3]);

  const lesson = getLesson(lessonId);

  if (!lesson) {
    return ctx.editMessageText("Lesson not found.");
  }

  const question = lesson.questions?.[qIndex];

  if (!question) {
    return ctx.editMessageText("Question not found.");
  }

  const isCorrect = optionIndex === question.answer;

  const resultText = isCorrect
    ? `✅ <b>Correct!</b>\n\n💡 ${escapeHtml(question.explanation)}`
    : `❌ <b>Not quite.</b>\n\nCorrect answer: <b>${escapeHtml(
        question.options[question.answer]
      )}</b>\n\n💡 ${escapeHtml(question.explanation)}`;

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
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs/promises");
const path = require("path");

const bot = new Telegraf(process.env.BOT_TOKEN);

const LESSONS_DIR = path.join(__dirname, "..", "data", "theHG", "1", "lessons");
const INDEX_PATH = path.join(LESSONS_DIR, "index.json");

const LEVELS = ["B2", "C1", "C2"];

async function readJson(filePath) {
  const data = await fs.readFile(filePath, "utf8");
  return JSON.parse(data);
}

async function getLessonsIndex() {
  return readJson(INDEX_PATH);
}

async function getLesson(id) {
  return readJson(path.join(LESSONS_DIR, `${id}.json`));
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
    const phrase = item[2] || item[0];
    const cleanPhrase = phrase?.trim();

    if (!cleanPhrase) continue;

    const escapedPhrase = escapeHtml(cleanPhrase);
    const regex = new RegExp(escapeRegExp(escapedPhrase), "gi");

    markedText = markedText.replace(regex, (match) => `<b>${match}</b>`);
  }

  return markedText;
}

function getChapterTitle(lesson) {
  return lesson.chapter || "Unknown chapter";
}

async function getChapters() {
  const lessonsIndex = await getLessonsIndex();
  const chapters = {};

  for (const [lessonId, lessonMeta] of Object.entries(lessonsIndex)) {
    const chapterTitle = getChapterTitle(lessonMeta);

    if (!chapters[chapterTitle]) {
      chapters[chapterTitle] = [];
    }

    chapters[chapterTitle].push([lessonId, lessonMeta]);
  }

  return chapters;
}

async function chapterMenu() {
  const chapters = await getChapters();

  return Markup.inlineKeyboard(
    Object.keys(chapters).map((chapterTitle) => [
      Markup.button.callback(`📖 ${chapterTitle}`, `chapter:${chapterTitle}`)
    ])
  );
}

async function chapterPartsMenu(chapterTitle) {
  const chapters = await getChapters();
  const parts = chapters[chapterTitle] || [];

  return Markup.inlineKeyboard([
    ...parts.map(([lessonId, lessonMeta]) => [
      Markup.button.callback(`📄 ${lessonMeta.part}`, `lesson:${lessonId}`)
    ]),
    [Markup.button.callback("⬅️ Back to chapters", "chapters")]
  ]);
}

function lessonKeyboard(lessonId, lesson) {
  const chapterTitle = getChapterTitle(lesson);

  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📖 Text B2", `text:${lessonId}:B2`),
      Markup.button.callback("📖 Text C1", `text:${lessonId}:C1`),
      Markup.button.callback("📖 Text C2", `text:${lessonId}:C2`)
    ],
    [Markup.button.callback("🎧 Audio", `audio:${lessonId}`)],
    [
      Markup.button.callback("🟦 B2 Quizlet", `quizlet:${lessonId}:B2`),
      Markup.button.callback("🟪 C1 Quizlet", `quizlet:${lessonId}:C1`),
      Markup.button.callback("🟥 C2 Quizlet", `quizlet:${lessonId}:C2`)
    ],
    [Markup.button.callback("✅ Practice", `q:${lessonId}:0`)],
    [Markup.button.callback("⬅️ Parts", `chapter:${chapterTitle}`)]
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
  return (
    `📖 <b>${escapeHtml(lesson.title)}</b>\n` +
    `${escapeHtml(lesson.chapter)} • ${escapeHtml(lesson.part)}\n` +
    `Level: ${escapeHtml(lesson.level || "B2/C1/C2")}`
  );
}

bot.start(async (ctx) => {
  const payload = ctx.startPayload;

  if (payload) {
    try {
      const lesson = await getLesson(payload);

      return ctx.reply(lessonHeader(lesson), {
        parse_mode: "HTML",
        reply_markup: lessonKeyboard(payload, lesson).reply_markup
      });
    } catch {
      // если payload битый — просто показываем меню глав
    }
  }

  await ctx.reply("📚 Choose a chapter:", await chapterMenu());
});

bot.action("chapters", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.editMessageText("📚 Choose a chapter:", {
    reply_markup: (await chapterMenu()).reply_markup
  });
});

bot.action(/^chapter:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const chapterTitle = ctx.match[1];

  await ctx.editMessageText(`📖 ${escapeHtml(chapterTitle)}\n\nChoose a part:`, {
    parse_mode: "HTML",
    reply_markup: (await chapterPartsMenu(chapterTitle)).reply_markup
  });
});

bot.action(/^lesson:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];

  try {
    const lesson = await getLesson(lessonId);

    await ctx.editMessageText(lessonHeader(lesson), {
      parse_mode: "HTML",
      reply_markup: lessonKeyboard(lessonId, lesson).reply_markup
    });
  } catch (error) {
    console.error(error);
    await ctx.editMessageText("Lesson not found.");
  }
});

bot.action(/^text:([^:]+):(B2|C1|C2)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const level = ctx.match[2];

  try {
    const lesson = await getLesson(lessonId);
    const quizlet = getLevelQuizlet(lesson, level);
    const markedText = boldQuizletPhrases(lesson.text, quizlet);

    await ctx.editMessageText(
      `📖 <b>${escapeHtml(level)} text focus</b>\n\n${markedText}`,
      {
        parse_mode: "HTML",
        reply_markup: lessonKeyboard(lessonId, lesson).reply_markup
      }
    );
  } catch (error) {
    console.error(error);
    await ctx.editMessageText("Lesson not found.");
  }
});

bot.action(/^audio:([^:]+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];

  try {
    const lesson = await getLesson(lessonId);

    if (!lesson.audio?.url) {
      return ctx.reply("Audio not found.");
    }

    await ctx.reply(
      `🎧 <a href="${escapeHtml(lesson.audio.url)}">${escapeHtml(
        lesson.audio.title || "Listen to audio"
      )}</a>`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: false
      }
    );
  } catch (error) {
    console.error(error);
    await ctx.reply("Audio not found.");
  }
});

bot.action(/^quizlet:([^:]+):(B2|C1|C2)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const level = ctx.match[2];

  try {
    const lesson = await getLesson(lessonId);
    const quizlet = getLevelQuizlet(lesson, level);

    if (!quizlet.length) {
      return ctx.editMessageText(`🧩 No ${level} Quizlet yet.`, {
        parse_mode: "HTML",
        reply_markup: lessonKeyboard(lessonId, lesson).reply_markup
      });
    }

    const text =
      `🧩 <b>${escapeHtml(level)} Quizlet</b>\n\n` +
      quizlet
        .map(
          ([en, ru]) =>
            `• <b>${escapeHtml(en.trim())}</b>\n  ${escapeHtml(ru.trim())}`
        )
        .join("\n\n");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: lessonKeyboard(lessonId, lesson).reply_markup
    });
  } catch (error) {
    console.error(error);
    await ctx.editMessageText("Lesson not found.");
  }
});

bot.action(/^q:([^:]+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const qIndex = Number(ctx.match[2]);

  try {
    const lesson = await getLesson(lessonId);
    const questions = lesson.questions || [];
    const question = questions[qIndex];

    if (!question) {
      return ctx.editMessageText("🏁 <b>Practice finished!</b>\n\nGreat work.", {
        parse_mode: "HTML",
        reply_markup: lessonKeyboard(lessonId, lesson).reply_markup
      });
    }

    await ctx.editMessageText(
      `✅ <b>Question ${qIndex + 1}/${questions.length}</b>\n\n${escapeHtml(
        question.question
      )}`,
      {
        parse_mode: "HTML",
        reply_markup: questionKeyboard(lessonId, qIndex, question).reply_markup
      }
    );
  } catch (error) {
    console.error(error);
    await ctx.editMessageText("Lesson not found.");
  }
});

bot.action(/^a:([^:]+):(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const lessonId = ctx.match[1];
  const qIndex = Number(ctx.match[2]);
  const optionIndex = Number(ctx.match[3]);

  try {
    const lesson = await getLesson(lessonId);
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
  } catch (error) {
    console.error(error);
    await ctx.editMessageText("Lesson not found.");
  }
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
'use strict';

/**
 * Meeting / interview "modes". Each mode decides which inputs to attach
 * (screen, transcript) and how to instruct the model. Kept separate from the
 * provider layer so adding a mode never touches AI code.
 *
 * A mode is: { label, needsScreen, small, userBubble, system, build(ctx) }
 *   ctx = { transcript: <"You: …\nThem: …" string>, userText: <string> }
 *   build() returns the user-turn text; `system` sets the behavior.
 *   userBubble: what to show as the user's message ('' = none, null = use userText).
 */

const BASE =
  'You are FreelyCluely, a discreet real-time copilot on an invisible overlay above the ' +
  "user's screen during a live call, interview, or coding session. \"You\" is the user; " +
  '"Them" is whoever they are talking to. Never mention the screenshot or that you are an AI. ' +
  'No preamble, no filler — deliver exactly what helps right now.';

const MODES = {
  // Do the single most useful thing given screen + recent conversation.
  assist: {
    label: 'Assist',
    needsScreen: true,
    small: false,
    userBubble: '',
    system:
      BASE +
      ' Read the screen and the recent conversation, infer what the user needs this instant, ' +
      'and give it directly. If the screen shows a coding problem, reply with a brief approach, ' +
      'a correct solution in a fenced code block, then time/space complexity. If it is a ' +
      'conversation, answer the open question or state, in the first person, exactly what to say next. ' +
      'Be concise and confident.',
    build(ctx) {
      return (
        'Recent conversation:\n' +
        (ctx.transcript || '(nothing captured yet)') +
        '\n\nGive me what I need right now.'
      );
    },
  },

  // Whisper the next line to say in a live conversation.
  say: {
    label: 'What to say',
    needsScreen: false,
    small: false,
    userBubble: 'What should I say?',
    system:
      BASE +
      ' Draft ONE short, natural, confident reply the user can say out loud next, in the first ' +
      'person. 1–3 sentences. No quotation marks, no "you could say", just the line itself.',
    build(ctx) {
      return (
        'Conversation so far:\n' +
        (ctx.transcript || '(nothing heard yet)') +
        '\n\nWhat should I say next?'
      );
    },
  },

  // Sharp follow-up questions to keep the discussion moving.
  followup: {
    label: 'Follow-ups',
    needsScreen: false,
    small: true,
    userBubble: 'Follow-up questions',
    system:
      BASE +
      ' Suggest 2–4 sharp, specific follow-up questions the user could ask next to sound engaged ' +
      'and steer the conversation. Return only a short bullet list.',
    build(ctx) {
      return (
        'Conversation so far:\n' + (ctx.transcript || '(none)') + '\n\nSuggest follow-up questions.'
      );
    },
  },

  // Catch-up summary of the whole session.
  recap: {
    label: 'Recap',
    needsScreen: false,
    small: true,
    userBubble: 'Recap',
    system:
      BASE +
      ' Summarize the conversation for someone who just joined: the key points, any decisions, ' +
      'and open action items. Use short bullets under bold headers. Keep it tight.',
    build(ctx) {
      return 'Full transcript:\n' + (ctx.transcript || '(nothing captured yet)') + '\n\nRecap this.';
    },
  },

  // Dedicated coding-problem solver from the screenshot.
  solve: {
    label: 'Solve screen',
    needsScreen: true,
    small: false,
    userBubble: "Solve what's on screen",
    system:
      'You are an expert competitive programmer and software engineer. The screenshot shows a ' +
      'coding or technical problem. Respond with: (1) a one-line restatement, (2) a short approach, ' +
      '(3) a clean, correct, idiomatic solution in a fenced code block (use the language on screen, ' +
      'else Python), (4) time and space complexity. Keep the prose minimal.',
    build() {
      return 'Solve the problem shown on screen.';
    },
  },

  // Free-form typed question, grounded in screen + conversation.
  ask: {
    label: 'Ask',
    needsScreen: true,
    small: false,
    userBubble: null, // the typed text is the bubble
    system:
      BASE +
      ' Answer the user\'s typed question directly and concisely, grounded in what is on screen ' +
      'and what was said.',
    build(ctx) {
      return (
        (ctx.transcript ? 'Recent conversation:\n' + ctx.transcript + '\n\n' : '') +
        'Question: ' +
        (ctx.userText || '')
      );
    },
  },
};

module.exports = { MODES };

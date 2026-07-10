import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getAccessToken } from "./apiClient";
import Layout from "./Layout";

function UserAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-white dark:bg-slate-600">
      You
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a5 5 0 0 0-5 5v2a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5Z" />
        <path d="M8 14v1a4 4 0 0 0 8 0v-1" />
        <path d="M12 19v3M9 22h6" />
      </svg>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
    </span>
  );
}

export default function Ask() {
  const [messages, setMessages] = useState([]); // { role: "user" | "assistant", text }
  const [question, setQuestion] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const abortControllerRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  // Auto-grow the textarea with content, like ChatGPT's composer.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [question]);

  async function sendQuestion() {
    const trimmed = question.trim();
    if (!trimmed || isStreaming) return;

    setErrorMessage(null);
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", text: trimmed }, { role: "assistant", text: "" }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ question: trimmed }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; each frame carries one
        // or more "data:" lines that we need to strip and re-join.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const chunk = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5))
            .join("\n");

          if (!chunk) continue;

          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              text: next[next.length - 1].text + chunk,
            };
            return next;
          });
        }
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setErrorMessage("Something went wrong while streaming the answer. Try again.");
    } finally {
      setIsStreaming(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendQuestion();
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendQuestion();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <Layout active="ask">
      <div className="flex min-h-screen flex-col bg-white dark:bg-slate-900">
        <div className="flex flex-1 flex-col" style={{ minHeight: "calc(100vh - 57px)" }}>
          {isEmpty ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4">
              <h1 className="text-3xl font-semibold text-slate-800 dark:text-slate-100">
                What do you want to know?
              </h1>
              <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                Ask a question and get an answer grounded in your uploaded documents.
              </p>

              <div className="mt-8 w-full max-w-2xl">
                <Composer
                  question={question}
                  setQuestion={setQuestion}
                  isStreaming={isStreaming}
                  onSubmit={handleSubmit}
                  onKeyDown={handleKeyDown}
                  textareaRef={textareaRef}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-4 py-8">
                  <div className="space-y-6">
                    {messages.map((message, index) => {
                      const isLast = index === messages.length - 1;
                      const isPendingAssistant =
                        message.role === "assistant" && isLast && isStreaming && !message.text;

                      return (
                        <div key={index} className="flex items-start gap-3">
                          {message.role === "user" ? <UserAvatar /> : <AssistantAvatar />}

                          {message.role === "user" ? (
                            <div className="ml-auto max-w-[75%] whitespace-pre-wrap rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                              {message.text}
                            </div>
                          ) : (
                            <div className="min-w-0 flex-1 whitespace-pre-wrap pt-1 text-sm leading-relaxed text-slate-800 dark:text-slate-100">
                              {isPendingAssistant ? <TypingDots /> : message.text}
                              {isLast && isStreaming && message.text && (
                                <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-slate-400" />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800">
                <div className="mx-auto max-w-3xl">
                  {errorMessage && (
                    <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                      {errorMessage}
                    </p>
                  )}
                  <Composer
                    question={question}
                    setQuestion={setQuestion}
                    isStreaming={isStreaming}
                    onSubmit={handleSubmit}
                    onKeyDown={handleKeyDown}
                    textareaRef={textareaRef}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

function Composer({ question, setQuestion, isStreaming, onSubmit, onKeyDown, textareaRef }) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex items-end gap-2 rounded-3xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:focus-within:ring-indigo-900"
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask a question about your documents…"
        disabled={isStreaming}
        autoFocus
        className="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:text-slate-100"
      />
      <button
        type="submit"
        disabled={isStreaming || !question.trim()}
        aria-label="Send question"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </form>
  );
}

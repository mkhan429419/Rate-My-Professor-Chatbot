"use client";
import { useState, useRef, useEffect } from "react";
import { Send, PlusCircle, Trash2 } from "react-feather";
import LoadingDots from "@/components/LoadingDots";
import icon from "@/public/assistant-avatar.png";
import Image from "next/image";
import UrlInputModal from "@/components/InputModal";
import {
  useUser,
  SignedIn,
  SignedOut,
  UserButton,
  SignInButton,
  useAuth,
} from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function Home() {
  // prod update
  const { user, isSignedIn } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (!isSignedIn) {
      router.push("/sign-in");
    }
  }, [isSignedIn, router]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/sign-in");
  };

  const [message, setMessage] = useState<string>("");
  const [history, setHistory] = useState<
    Array<{ role: string; content: string }>
  >([
    {
      role: "assistant",
      content: `Hi! I'm the Rate My Professor support assistant. How can I help you today?`,
    },
  ]);
  const lastMessageRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isModalOpen, setModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (user) {
      fetchUserHistory(user.id);
    }
  }, [user]);

  const fetchUserHistory = async (userId: string) => {
    try {
      const response = await fetch(`/api/chat/history?userId=${userId}`);
      const data = await response.json();
      if (data.history) {
        setHistory(data.history);
      }
    } catch (error) {
      console.error("Failed to fetch user history:", error);
    }
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  };

  const sendMessage = async () => {
    if (!message.trim()) return;

    const newHistory = [
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ];

    setMessage("");
    setHistory(newHistory);
    setLoading(true);

    scrollToBottom();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newHistory),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let result = "";

      const processText = async ({
        done,
        value,
      }: {
        done: boolean;
        value?: Uint8Array;
      }): Promise<string> => {
        if (done) {
          return result;
        }
        const text = decoder.decode(value || new Uint8Array(), {
          stream: true,
        });
        result += text;

        setHistory((oldHistory) => {
          const updatedHistory = [...oldHistory];
          updatedHistory[updatedHistory.length - 1].content =
            formatResponse(result);
          return updatedHistory;
        });

        scrollToBottom();

        return reader?.read().then(processText) as Promise<string>;
      };

      if (reader) {
        await reader.read().then(processText);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setHistory((oldHistory) => [
        ...oldHistory.slice(0, oldHistory.length - 1),
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again later.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatResponse = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br/>")
      .replace(/\d+\.\s(.*?)(?=\d+\.|$)/g, "<p>$1</p>")
      .replace(/(?:^|\n)([^:]+):(.*?)(\n|$)/g, "<p><strong>$1:</strong>$2</p>");
  };

  const clearChat = () => {
    setHistory([
      {
        role: "assistant",
        content: `Hi! I'm the Rate My Professor support assistant. How can I help you today?`,
      },
    ]);
  };

  const handleSaveUrl = (url: string) => {
    console.log("URL Saved:", url);
    setModalOpen(false);
  };

  useEffect(() => {
    scrollToBottom();
  }, [history]);

  return (
    <main className="h-screen bg-white flex flex-col">
      <div className="flex flex-col gap-8 w-full items-center flex-grow max-h-full">
        <div className="flex justify-between items-center w-full lg:w-3/4 mt-6 px-4">
          <h1 className="text-3xl text-transparent font-extralight bg-clip-text bg-gradient-to-r from-violet-800 to-fuchsia-500">
            Rate My Professor Chat
          </h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 text-violet-600 hover:text-violet-800"
            >
              <PlusCircle size={20} />
              <span>Add URL</span>
            </button>
            <button
              onClick={clearChat}
              className="flex items-center gap-2 text-red-600 hover:text-red-800"
            >
              <Trash2 size={20} />
              <span>Clear Chat</span>
            </button>
            <SignedOut>
              <SignInButton />
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </div>
        </div>

        <div className="rounded-2xl border-purple-700 border-opacity-5 border lg:w-3/4 flex-grow flex flex-col bg-[url('/bgm.png')] bg-cover max-h-full overflow-hidden">
          <div
            ref={chatContainerRef}
            className="overflow-y-auto flex flex-col gap-5 p-10"
            style={{ height: "calc(100% - 96px)" }}
          >
            {history.map((message, idx) => {
              const isLastMessage = idx === history.length - 1;
              switch (message.role) {
                case "assistant":
                  return (
                    <div
                      ref={isLastMessage ? lastMessageRef : null}
                      key={idx}
                      className="flex gap-2"
                    >
                      <Image
                        alt="ai icon"
                        src={icon}
                        className="h-12 w-12 rounded-full"
                      />
                      <div className="w-auto max-w-xl break-words bg-white rounded-b-xl rounded-tr-xl text-black p-6 shadow-[0_10px_40px_0px_rgba(0,0,0,0.15)]">
                        <p className="text-sm font-medium text-violet-500 mb-2">
                          AI assistant
                        </p>
                        <div className="formatted-content">
                          {loading && isLastMessage ? (
                            <LoadingDots />
                          ) : (
                            <div
                              dangerouslySetInnerHTML={{
                                __html: message.content,
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                case "user":
                  return (
                    <div
                      className="w-auto max-w-xl break-words bg-white rounded-b-xl rounded-tl-xl text-black p-6 self-end shadow-[0_10px_40px_0px_rgba(0,0,0,0.15)]"
                      key={idx}
                      ref={isLastMessage ? lastMessageRef : null}
                    >
                      <p className="text-sm font-medium text-violet-500 mb-2">
                        You
                      </p>
                      {message.content}
                    </div>
                  );
              }
            })}
          </div>

          <div className="flex sticky bottom-4 w-full px-6 pb-6 h-24 bg-transparent">
            <div className="w-full relative">
              <textarea
                aria-label="chat input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message"
                className="w-full h-full resize-none rounded-full border border-slate-900/10 bg-white pl-6 pr-24 py-[25px] text-base placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-4 focus:ring-violet-500/10 shadow-[0_10px_40px_0px_rgba(0,0,0,0.15)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="flex w-14 h-14 items-center justify-center rounded-full px-3 text-sm bg-violet-600 font-semibold text-white hover:bg-violet-700 active:bg-violet-800 absolute right-2 bottom-2 disabled:bg-violet-100 disabled:text-violet-400"
                type="submit"
                aria-label="Send"
                disabled={!message || loading}
              >
                <Send />
              </button>
            </div>
          </div>
        </div>
      </div>

      <UrlInputModal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveUrl}
      />
    </main>
  );
}

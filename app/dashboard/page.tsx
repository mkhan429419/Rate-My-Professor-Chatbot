'use client'

import React, { useState, useRef, useEffect } from 'react';
import Spline from '@splinetool/react-spline';
import { Box, Button, Stack, TextField } from '@mui/material';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi! I'm the Rate My Professor support assistant. How can I help you today?`,
    },
  ]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const lastMessageRef = useRef<HTMLDivElement | null>(null);

  const sendMessage = async () => {
    if (!message.trim()) return; // prevent sending empty messages

    setMessage(''); // clear the input
    setIsLoading(true); // show loading spinner
    setMessages((messages) => [
      ...messages,
      { role: 'user', content: message },
      { role: 'assistant', content: '' }, // placeholder for response
    ]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([...messages, { role: 'user', content: message }]),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let result = '';

      const processText = async ({ done, value }: { done: boolean, value?: Uint8Array }): Promise<string> => {
        if (done) {
          return result;
        }
        const text = decoder.decode(value || new Uint8Array(), { stream: true });
        result += text;

        setMessages((messages) => {
          const lastMessage = messages[messages.length - 1];
          const otherMessages = messages.slice(0, messages.length - 1);
          return [...otherMessages, { ...lastMessage, content: lastMessage.content + text }];
        });

        return reader?.read().then(processText) as Promise<string>;
      };

      if (reader) {
        await reader.read().then(processText);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((messages) => [
        ...messages.slice(0, messages.length - 1),
        {
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again later.',
        },
      ]);
    } finally {
      setIsLoading(false); // hide loading spinner
    }
  };

  useEffect(() => {
    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="relative">
      {/* Spline Background */}
      <div className="absolute inset-0 z-0 h-screen w-full">
        <Spline scene="https://prod.spline.design/JFMHOoexQfGOdGoA/scene.splinecode" />
      </div>
      <div className="px-36 pt-16">
        {/* Foreground Card */}
        <div className="relative border-[1.2px] z-10 w-full h-[calc(100vh-8rem)] bg-glass grid grid-cols-12 rounded-lg overflow-hidden">
          <div className="col-span-8 relative flex flex-col pl-2 py-2">
            {/* Scrollable Content Area */}
            <div className="flex-grow p-4 overflow-y-auto h-[calc(100vh-10rem)] pb-20 resumeform">
              {messages.map((message, index) => (
                <div
                  key={index}
                  ref={index === messages.length - 1 ? lastMessageRef : null}
                  className={`mb-4 p-4 rounded-2xl shadow ${
                    message.role === 'assistant'
                      ? 'bg-white rounded-tl-none border border-gray-300 text-gray-800'
                      : 'bg-gradient-to-r from-purple-600 to-blue-500 text-white rounded-tr-none'
                  } max-w-xl self-${message.role === 'assistant' ? 'start' : 'end'}`}
                >
                  <p className="text-sm font-medium mb-1">
                    {message.role === 'assistant' ? 'AI Assistant' : 'You'}
                  </p>
                  <p>{message.content}</p>
                </div>
              ))}
              {isLoading && (
                <div className="bg-white p-4 rounded-lg shadow mb-4">
                  <p>Loading response...</p>
                </div>
              )}
            </div>

            {/* Input Form at the Bottom */}
            <div className="absolute bottom-0 left-0 p-2 w-full bg-glass-input rounded-t-2xl">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
              >
                <label htmlFor="prompt" className="mb-2 text-sm font-medium text-gray-900 sr-only">
                  Enter Prompt
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="prompt"
                    className="block w-full p-4 pl-10 text-sm bg-transparent outline-none"
                    placeholder="Enter your prompt here"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                  />
                  <button
                    type="submit"
                    className="text-white absolute right-2.5 bottom-2.5 bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-4 py-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
          <div className="border-l border-gray-400 my-3 ml-4 col-span-4"></div>
        </div>
      </div>
    </div>
  );
}

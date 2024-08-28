"use client"
import React, { useState } from 'react';
import Spline from '@splinetool/react-spline';
import Groq from "groq-sdk";

// Initialize Groq client
const groq = new Groq({ apiKey:"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"
    ,
    dangerouslyAllowBrowser: true,
 });

function Page() {
    const [prompt, setPrompt] = useState('');
    const [response, setResponse] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: { preventDefault: () => void; }) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const chatCompletion = await getGroqChatCompletion(prompt);
            setResponse(chatCompletion.choices[0]?.message?.content || "No response");
        } catch (error) {
            console.error("Error fetching response:", error);
            setResponse("Error fetching response. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    async function getGroqChatCompletion(prompt: string) {
        return groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            model: "llama3-8b-8192",
        });
    }

    return (
        <div className="relative">
            {/* Spline Background */}
            <div className="absolute inset-0 z-0 h-screen w-full">
                <Spline scene="https://prod.spline.design/JFMHOoexQfGOdGoA/scene.splinecode" />
            </div>
            <div className="px-36 pt-16">
                {/* Foreground Card */}
                <div className="relative border-[1.2px] z-10 w-full h-[calc(100vh-8rem)] bg-glass grid grid-cols-12 rounded-lg overflow-hidden">
                    <div className="col-span-8 relative flex flex-col pl-2 py-2 ">
                        {/* Scrollable Content Area */}
                        <div className="flex-grow p-4 overflow-y-auto h-[calc(100vh-10rem)] pb-20 resumeform">
                            {isLoading && (
                                <div className="bg-white p-4 rounded-lg shadow mb-4">
                                    <p>Loading response...</p>
                                </div>
                            )}
                            {response && (
                                <div className="bg-white p-4 rounded-lg shadow mb-4">
                                    <h3 className="font-bold mb-2">Response:</h3>
                                    <p>{response}</p>
                                </div>
                            )}
                            {/* You can keep or remove the following placeholder content */}
                            <div className="h-20 bg-gray-200 mb-4">Content 1</div>
                            <div className="h-20 bg-gray-200 mb-4">Content 2</div>
                            <div className="h-20 bg-gray-200 mb-4">Content 3</div>
                        </div>

                        {/* Input Form at the Bottom */}
                        <div className="absolute bottom-0 left-0 p-2 w-full bg-glass-input rounded-t-2xl">
                            <form onSubmit={handleSubmit}>
                                <label htmlFor="prompt" className="mb-2 text-sm font-medium text-gray-900 sr-only">
                                    Enter Prompt
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        id="prompt"
                                        className="block w-full p-4 pl-10 text-sm bg-transparent outline-none"
                                        placeholder="Enter your prompt here"
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
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

export default Page;
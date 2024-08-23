'use client'

import { Box, Button, Stack, TextField } from '@mui/material'
import { useState } from 'react'

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi! I'm the Rate My Professor support assistant. How can I help you today?`,
    },
  ])
  const [message, setMessage] = useState('')

  const sendMessage = async () => {
    if (!message.trim()) return; // prevent sending empty messages

    setMessage('') // clear the input
    setMessages((messages) => [
      ...messages,
      { role: 'user', content: message },
      { role: 'assistant', content: '' }, // placeholder for response
    ])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([...messages, { role: 'user', content: message }]),
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let result = ''

      const processText = async ({ done, value }: { done: boolean, value?: Uint8Array }): Promise<string> => {
        if (done) {
          return result
        }
        const text = decoder.decode(value || new Uint8Array(), { stream: true })
        result += text

        setMessages((messages) => {
          const lastMessage = messages[messages.length - 1]
          const otherMessages = messages.slice(0, messages.length - 1)
          return [...otherMessages, { ...lastMessage, content: lastMessage.content + text }]
        })

        return reader?.read().then(processText) as Promise<string>
      }

      if (reader) {
        await reader.read().then(processText)
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setMessages((messages) => [
        ...messages.slice(0, messages.length - 1),
        {
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again later.',
        },
      ])
    }
  }

  return (
    <Box
      width="100vw"
      height="100vh"
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
    >
      <Stack
        direction={'column'}
        width="500px"
        height="700px"
        border="1px solid black"
        p={2}
        spacing={3}
      >
        <Stack
          direction={'column'}
          spacing={2}
          flexGrow={1}
          overflow="auto"
          maxHeight="100%"
        >
          {messages.map((message, index) => (
            <Box
              key={index}
              display="flex"
              justifyContent={message.role === 'assistant' ? 'flex-start' : 'flex-end'}
            >
              <Box
                bgcolor={message.role === 'assistant' ? 'primary.main' : 'secondary.main'}
                color="white"
                borderRadius={16}
                p={3}
                maxWidth="80%"
                whiteSpace="pre-wrap" // This ensures that line breaks are preserved
              >
                {message.content}
              </Box>
            </Box>
          ))}
        </Stack>
        <Stack direction={'row'} spacing={2}>
          <TextField
            label="Message"
            fullWidth
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                sendMessage()
              }
            }}
          />
          <Button variant="contained" onClick={sendMessage}>
            Send
          </Button>
        </Stack>
      </Stack>
    </Box>
  )
}

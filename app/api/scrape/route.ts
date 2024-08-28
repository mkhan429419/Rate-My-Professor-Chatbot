import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request: Request) {
  const { url } = await request.json();

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  const scraperPath = path.join(process.cwd(), 'chatbot-python', 'scraper.py');
  
  return new Promise((resolve) => {
    const pythonProcess = spawn('python', [scraperPath, url]);

    pythonProcess.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
      resolve(NextResponse.json({ success: true }));
    });
  });
}

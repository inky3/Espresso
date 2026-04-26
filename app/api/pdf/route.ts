import { NextResponse } from 'next/server';
import { PDFExtract } from 'pdf.js-extract';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Convert the file to a buffer for the parser
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const pdfExtract = new PDFExtract();
    const options = {}; // Use default options
    
    // Extract text from the PDF buffer
    const data = await pdfExtract.extractBuffer(buffer, options);
    
    // Combine all text snippets from all pages into one string
    const extractedText = data.pages
      .map(page => page.content.map(item => item.str).join(' '))
      .join('\n');

    return NextResponse.json({ 
      name: file.name, 
      text: extractedText 
    });

  } catch (error: any) {
    console.error("SebOS PDF Error:", error.message);
    return NextResponse.json({ error: "Failed to process document" }, { status: 500 });
  }
}
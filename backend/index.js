import { Configuration, OpenAIApi } from "openai";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import multer from 'multer';
import {PdfReader} from 'pdfreader';
import fsAsync from 'fs/promises';
import fs from 'fs';
import csv from 'csv-parser';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

//Constants
const EMBEDDING_FILE_PATH = 'data\\fileEmbedding.csv';//we are using csv file as database to store file embeddings
const OPENAI_COMPLETIONS_MODEL = "text-davinci-003";
const OPENAI_EMBEDDING_MODEL = 'text-embedding-ada-002';
const DEFAULT_AI_COMPLETION_TEXT = 'Hey there!, This is response from AI agent.Please upload PDF to provide more context';

//SECRETS
const OPENAI_KEYS_ORGANIZATION = '';
const OPENAI_KEYS_API = '';

if(OPENAI_KEYS_ORGANIZATION == '' || OPENAI_KEYS_API == '' )
{
  throw new Error(`Please update OpenAPI Organization & API Secret constants with actual secrets.See Line No 20 & 21 in index.js.`)
}
const app = express();
const port = 8000;
app.use(bodyParser.json());
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set up multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const openAIApiConfiguration = new Configuration({
  organization: OPENAI_KEYS_ORGANIZATION,
  apiKey: OPENAI_KEYS_API,
});

const openai = new OpenAIApi(openAIApiConfiguration);

// Define the static directory to serve the HTML file
app.use(express.static(join(__dirname, 'public')));

// Route to serve the landing page
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});


app.post("/", async (request, response) => {
  const { chats } = request.body;
  const prompt = chats.content;

  const embeddingData = {};//await getFileEmbedding();

  let completion = DEFAULT_AI_COMPLETION_TEXT;

  if (Object.keys(embeddingData).length > 0) {
    completion = await generateOpenAIResponse(prompt, embeddingData);
  }
  console.log(`User Prompt:${prompt}`) 
  console.log(`Chatbot Response:${completion}`)
  response.json({
    output: { role: "AI_Assignment_PDF_Embedding_Bot", content: completion },
  });
});

app.post('/upload-pdf', upload.array('files',100), async (req, res) => {
  try {
    const files = req.files;
    const fileResponses = await Promise.all(files.map(async (file, index) => {

      // Extract text from the uploaded PDF
      const pdfText = await extractTextFromPDF(file.buffer);   

      // Use OpenAI to generate embedding from the PDF text
      const pdfEmbedding = await generateEmbedding(pdfText, OPENAI_EMBEDDING_MODEL);      

      await storeFileEmbeddingInCsv(pdfText,JSON.stringify(pdfEmbedding));   

      return `File :${file.originalname} uploaded successfully`;
    }));
        
    res.json({ fileResponses });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const GeneratePromptRequest = async (prompt,embeddingData) => {

  // get embeddings value for prompt question
  const promptEmbedding = await generateEmbedding(prompt, OPENAI_EMBEDDING_MODEL);

  // create map of text against similarity score
  const similarityScoreHash = getSimilarityScore(
    embeddingData,
    promptEmbedding
  );

  // get text (i.e. key) from score map that has highest similarity score
  const textWithHighestScore = Object.keys(similarityScoreHash).reduce(
    (a, b) => (similarityScoreHash[a] > similarityScoreHash[b] ? a : b)
  );

  // build final prompt
  const finalPrompt = `
    Info: ${textWithHighestScore}
    Question: ${prompt}
    Answer:
    `;
  return finalPrompt;
}

// Function to read data from a CSV file
const readFromCSV = (csvFilePath) => {
  const data = {};
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        // Process each row of data
        data[row["Text"]] = row["Embedding"];        
      })
      .on('end', () => {
        // Finished reading the CSV file
        resolve(data);
      })
      .on('error', (error) => {        
        reject(error);
      });
  });
}

const generateOpenAIResponse = async (prompt, embeddingData) => {

  const finalPrompt = await GeneratePromptRequest(prompt, embeddingData);

  const api_response = await openai.createCompletion({
    model: OPENAI_COMPLETIONS_MODEL,
    prompt: finalPrompt,
    max_tokens: 64,
  });

  return  api_response.data.choices[0].text;;
}

const calculateCosineSimilarity = (A, B) => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < A.length; i++) {
    dotProduct += A[i] * B[i];
    normA += A[i] * A[i];
    normB += B[i] * B[i];
  }
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  return dotProduct / (normA * normB);
}

const getSimilarityScore = (embeddingsHash, promptEmbedding) => {
  const similarityScoreHash = {};
  Object.keys(embeddingsHash).forEach((text) => {
    similarityScoreHash[text] = calculateCosineSimilarity(
      promptEmbedding,
      JSON.parse(embeddingsHash[text])
    );
  });
  return similarityScoreHash;
}


const getFileEmbedding = async () => {

  const fileData = await readFromCSV(EMBEDDING_FILE_PATH);  
  return fileData;
}

const storeFileEmbeddingInCsv =  async (fileText,fileEmbedding)=>{

   const data = [fileText, fileEmbedding]
   const formattedData = data.map(row => `"${row}"`).join(',');

  await fsAsync.appendFile(EMBEDDING_FILE_PATH,formattedData +'\n');
}

// Extract text from PDF using pdf-parse
const extractTextFromPDF = (pdfBuffer) => {

  return new Promise((resolve, reject) => {

    const textLines = [];

    new PdfReader().parseBuffer(pdfBuffer, (err, item) => {
      if (err) {
        console.error("error:", err);
        reject(err);
      }
      else if (!item) {
        console.warn("end of buffer");
        const pageText = textLines.join('');
        resolve(pageText);

      }
      else if (item.text) {
        textLines.push(item.text);        
      }
    });
  });

};

// Generate embedding using OpenAI API
const generateEmbedding = async (text, model) => {
  const response = await openai.createEmbedding({
    model: model,
    input: text,
  });

  return response.data.data[0].embedding;
};

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
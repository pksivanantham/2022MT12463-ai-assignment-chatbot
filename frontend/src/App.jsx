import { useState, useRef, useEffect } from "react";
import axios from 'axios';
import "./App.css";

function App() {
  const [message, setMessage] = useState("");
  const [chats, setChats] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [pdfFiles, setPdfFiles] = useState(null);
  const [uploadResponse, setUploadResponse] = useState(null);
  const [showFileUpload, setShowFileUpload] = useState(false);

  const chatSectionRef = useRef(null); 
  useEffect(() => {
    // Scroll to the bottom when chats are updated
    if (chatSectionRef.current) {
      chatSectionRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chats]);

  const chat = async (e, message) => {
    e.preventDefault();

    if (!message) return;
    setIsTyping(true);
    scrollTo(0, 1e10);

    let msgs = chats;
    let latestUserPrompt = { role: "User", content: message };
    msgs.push(latestUserPrompt);
    setChats(msgs);

    setMessage("");

    fetch("http://localhost:8000/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chats: latestUserPrompt,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        msgs.push(data.output);
        setChats(msgs);
        setIsTyping(false);
        scrollTo(0, 1e10);
      })
      .catch((error) => {
        console.log(error);
      });
  };
  const handleFileChange = (e) => {
    setPdfFiles(e.target.files);
  };

  const handleSendMessage = async () => {

    // Send the PDF file to the server
    try {
      const formData = new FormData();
      Array.from(pdfFiles).forEach((file, index) => {
        formData.append(`files`, file);
      });
      axios.defaults.baseURL = 'http://localhost:8000';
      const response = await axios.post('/upload-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadResponse(response.data.fileResponses);
      if (chatSectionRef.current) {
      chatSectionRef.current.scrollIntoView({ behavior: "smooth" });
      }
      
    } catch (error) {
      console.error('Error fetching response from server:', error);
    }

    // Clear the  PDF file    
    setPdfFiles(null);
  };
  const toggleFileUpload = () => {
    setShowFileUpload(!showFileUpload);
  };
  return (
    <main>
      <h1>2022MT12463 - AI Assignment Sem 3 - ChatBot</h1>
       {/* Toggle button for show/hide file upload */}
       <div style={{ display: 'flex', alignItems: 'center' }}>
        {/* Show/hide file upload button */}
        <button onClick={toggleFileUpload} className="upload-button">
          {showFileUpload ? "Hide File Upload" : "Show File Upload"}
        </button>

        {/* Informative text */}
        <p style={{ marginLeft: '10px',background:'#bdbdbd' }}>
          {showFileUpload
            ? "Upload PDF files to get personalized responses!"
            : "Click 'Show File Upload' to upload PDF files."}
        </p>
      </div>
      {showFileUpload && (
        <div>
          <input
            multiple
            id="file-upload"
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
          />
          <button onClick={handleSendMessage} disabled={!pdfFiles} >
            Upload pdf files
          </button>
        </div>
      )}

      {showFileUpload && uploadResponse && (
        <div>
          <h2>Upload Response:</h2>
          <ul>
            {uploadResponse.map((response, index) => (
              <li key={index}>{response}</li>
            ))}
          </ul>
        </div>
      )}
      <section>
        {chats && chats.length
          ? chats.map((chat, index) => (
            <p key={index} className={chat.role === "User" ? "user_msg" : "chatbot-msg"}>
              <span>
                <b>{chat.role}</b>
              </span>
              <span>:</span>
              <span>{chat.content}</span>
            </p>
          ))
          : ""}
      </section>

      <div className={isTyping ? "" : "hide"}>
        <p>
          
          <b>{isTyping ? "AI_Assignment_PDF_Embedding_Bot:" : ""}</b><i>{isTyping ? "Typing..." : ""}</i>
        </p>
      </div>

      <form action="" onSubmit={(e) => chat(e, message)}>
        <input
          type="text"
          name="message"
          value={message}
          placeholder="Type a message here and hit Enter/click Send button..."
          onChange={(e) => setMessage(e.target.value)}
        />
        <button onClick={(e) => chat(e, message)}>
          Send
        </button>
      </form>
    </main>
  );
}

export default App;

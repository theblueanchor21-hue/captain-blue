import React, { useState, useEffect, useRef } from 'react';
import { Send, Menu } from 'lucide-react';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const [guestToken, setGuestToken] = useState(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    // Parse URL token
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('r');
    if (token) {
      setGuestToken(token);
      setMessages([
        { role: 'assistant', text: "Ahoy! Let me check my guest manifest... Ah, I see you! Welcome to The Blue Anchor. How can I help you navigate your stay?" }
      ]);
    } else {
      setMessages([
        { role: 'assistant', text: "Ahoy there! I'm Captain Blue. To pull up your reservation and make sure we have everything shipshape, what's your first and last name?" }
      ]);
    }
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    // Add user message
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          history: messages, 
          message: userMsg,
          guestToken: guestToken 
        })
      });

      setIsTyping(false);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let assistantText = '';

      // Initialize empty assistant message
      setMessages(prev => [...prev, { role: 'assistant', text: '' }]);

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value);
        
        // Parse the SSE format "data: {...}\n\n"
        const lines = chunkValue.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              assistantText += data.text;
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1].text = assistantText;
                return newMessages;
              });
            } catch(e) {}
          }
        }
      }
    } catch (error) {
      setIsTyping(false);
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error connecting to the mainland. Give me a second...' }]);
    }
  };

  return (
    <div className="flex flex-col h-[100svh] bg-slate-50 w-full max-w-md mx-auto shadow-xl relative overflow-hidden">
      
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img 
              src="/Captain_Blue_Logo.png" 
              alt="Captain Blue" 
              className="w-10 h-10 rounded-full bg-blue-100 p-1 object-cover animate-float shadow-sm border border-slate-200"
            />
            {/* Status dot */}
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
          </div>
          <div>
            <h1 className="font-semibold text-slate-800 text-lg leading-tight">Captain Blue</h1>
            <p className="text-xs text-slate-500 font-medium">The Blue Anchor Concierge</p>
          </div>
        </div>
        <button className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors">
          <Menu size={20} />
        </button>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4">
        {messages.map((message, i) => (
          <div key={i} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}>
            {message.role === 'assistant' && (
              <img 
                src="/Captain_Blue_Logo.png" 
                alt="Captain Blue" 
                className="w-8 h-8 rounded-full bg-blue-50 p-1 object-cover mr-2 self-end shadow-sm"
              />
            )}
            <div className={`
              max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm text-[15px] leading-relaxed
              ${message.role === 'user' 
                ? 'bg-blue-600 text-white rounded-br-none' 
                : 'bg-white text-slate-700 rounded-bl-none border border-slate-100'
              }
            `}>
              {message.text}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start w-full">
            <img 
              src="/Captain_Blue_Logo.png" 
              alt="Captain Blue" 
              className="w-8 h-8 rounded-full bg-blue-50 p-1 object-cover mr-2 self-end shadow-sm"
            />
            <div className="max-w-[80%] rounded-2xl px-4 py-3 shadow-sm bg-white border border-slate-100 rounded-bl-none flex items-center justify-center gap-1">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Inputs */}
      <div className="p-4 bg-white border-t border-slate-100 w-full">
        <div className="flex items-center gap-2 relative">
          <input 
            type="text" 
            placeholder="Ask anything..." 
            className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-shadow text-slate-700"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white rounded-full shadow-md transition-colors shadow-blue-600/30 flex items-center justify-center"
          >
            <Send size={18} className="translate-x-[1px] translate-y-[1px]" />
          </button>
        </div>
      </div>

    </div>
  );
}

export default App;

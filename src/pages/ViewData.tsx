// import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { useDashboardStore } from '@/store/dashboardStore';
import { fetchTableData, ValidationError } from '@/api/tableData';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import React, { useState, useEffect, useRef } from 'react';
import { sendToWebhook } from '@/api/api4';
import { MessageCircle, Mic, Send, X, Bot, User, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ViewData = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    selectedDatabase,
    setTableData,
    setLoading,
    setError,
  } = useDashboardStore();


  // Fetch table data when selectedDatabase changes
  useEffect(() => {
    if (!selectedDatabase) {
      navigate('/');
      return;
    }
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchTableData(selectedDatabase, 1000, 0);
        setTableData(data.data);
      } catch (err: any) {
        // Handle validation error from API
        if (err && err.detail) {
          const validation: ValidationError = err;
          setError(validation.detail.map((d) => d.msg).join(', '));
        } else if (err && err.message) {
          setError(err.message);
        } else {
          setError('Failed to fetch table data.');
        }
        setTableData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedDatabase, navigate, setTableData, setLoading, setError]);

  // Month/Year State for Calculate Month End Data
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('');

  // Example calculation handler
  const handleCalculate = () => {
    if (!selectedMonth || !selectedYear) {
      toast({
        title: "Missing Information",
        description: "Please select both month and year before calculating.",
        variant: "destructive",
      });
      return;
    }
    // TODO: Replace with your actual calculation logic
    toast({
      title: "Calculation Started",
      description: `Calculating month end data for ${getMonthName(selectedMonth)} ${selectedYear}`,
    });
  };

  const getMonthName = (monthNumber: string) => {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    return months[parseInt(monthNumber) - 1] || '';
  }

  // Floating Action Button and Chat Popup with text & voice input
  const ChatFab = () => {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState([
      { id: 1, text: "Hello! I'm your AI assistant. How can I help you?", isUser: false, timestamp: new Date() },
    ]);
    const [isLoading, setIsLoading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const recognitionRef = useRef<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom on new message
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, open]);

    // Voice input using Web Speech API
    const handleVoiceInput = () => {
      if (!('webkitSpeechRecognition' in window)) {
        alert('Voice input not supported in this browser.');
        return;
      }
      if (isRecording) {
        recognitionRef.current?.stop();
        setIsRecording(false);
        return;
      }
      const recognition = new (window as any).webkitSpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setMessage((prev) => prev + (prev ? ' ' : '') + transcript);
      };
      recognition.onend = () => setIsRecording(false);
      recognition.onerror = () => setIsRecording(false);
      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    };

    const handleSend = async () => {
      if (!message.trim()) return;
      const userMsg = { id: Date.now(), text: message, isUser: true, timestamp: new Date() };
      setMessages((msgs) => [...msgs, userMsg]);
      setMessage('');
      setIsLoading(true);
      try {
        const answer = await sendToWebhook(message);
        setMessages((msgs) => [
          ...msgs,
          { id: Date.now() + 1, text: answer, isUser: false, timestamp: new Date() },
        ]);
      } catch (err: any) {
        setMessages((msgs) => [
          ...msgs,
          { id: Date.now() + 1, text: 'Failed to get response', isUser: false, timestamp: new Date() },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    };

    return (
      <>
        {/* Floating Action Button */}
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 shadow-lg flex items-center justify-center z-50 hover:scale-110 transition-transform"
            aria-label="Open chat assistant"
          >
            <MessageCircle className="w-7 h-7 text-white" />
          </button>
        )}
        {/* Chat Popup */}
        {open && (
          <div className="fixed bottom-6 right-6 w-96 max-w-full h-[500px] bg-white shadow-2xl rounded-xl flex flex-col z-50 border">
            <div className="flex items-center justify-end px-4 py-3 bg-gradient-to-br from-blue-500 to-purple-500 rounded-t-xl">
              <button onClick={() => setOpen(false)} className="text-white hover:bg-white/20 rounded-full p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4 bg-gray-50">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex items-start space-x-2 ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                  {!msg.isUser && (
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-lg p-3 ${msg.isUser ? 'bg-gradient-to-br from-blue-500 to-purple-500 text-white' : 'bg-white border'}`}>
                    <p className="text-sm whitespace-pre-line">{msg.text}</p>
                    <p className="text-xs opacity-60 mt-1">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  {msg.isUser && (
                    <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex items-start space-x-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white border rounded-lg p-3 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-500">Typing...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t bg-white flex items-center gap-3">
              <input
                type="text"
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className="flex-1 border-2 border-gray-200 rounded-full px-4 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm transition-all"
                disabled={isLoading}
                style={{ minWidth: 0 }}
              />
              <button
                onClick={handleVoiceInput}
                className={`rounded-full p-3 bg-gray-100 hover:bg-blue-100 transition-colors flex items-center justify-center ${isRecording ? 'ring-2 ring-blue-400 animate-pulse' : ''}`}
                aria-label="Voice input"
                disabled={isLoading}
              >
                <Mic className={`w-6 h-6 ${isRecording ? 'text-blue-600' : 'text-gray-600'}`} />
              </button>
              <button
                onClick={handleSend}
                className="rounded-full p-3 bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-lg hover:scale-110 transition-transform flex items-center justify-center"
                aria-label="Send message"
                disabled={!message.trim() || isLoading}
              >
                <Send className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-dashboard-bg">
      {/* Header */}
      <div className="bg-white shadow-card border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                onClick={() => navigate('/')}
                variant="outline"
                size="sm"
                className="border-2 hover:bg-muted transition-smooth"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Selection
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Database Management
                </h1>
                <p className="text-muted-foreground">
                  View and edit your database records
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Calculate Month End Data Section */}
      <div className="max-w-7xl mx-auto px-6 pt-8 pb-2">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-foreground">Calculate Month End Data:</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="">Select Month</option>
            <option value="01">January</option>
            <option value="02">February</option>
            <option value="03">March</option>
            <option value="04">April</option>
            <option value="05">May</option>
            <option value="06">June</option>
            <option value="07">July</option>
            <option value="08">August</option>
            <option value="09">September</option>
            <option value="10">October</option>
            <option value="11">November</option>
            <option value="12">December</option>
          </select>
          <Input
            type="text"
            placeholder="Enter Year (e.g., 2024)"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-48"
          />
          <Button
            onClick={handleCalculate}
            className="bg-gradient-primary hover:bg-primary-hover text-white"
          >
            Calculate
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <DataTable />
      </div>

      {/* Floating Action Button for Chatbot */}
      <ChatFab />
    </div>
  );
};

export default ViewData;
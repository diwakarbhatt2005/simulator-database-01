// import { useState, useRef, useEffect } from 'react';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// import { MessageCircle, Send, X, Loader2, Bot, User } from 'lucide-react';
// import { useDashboardStore } from '@/store/dashboardStore';
// import { useToast } from '@/hooks/use-toast';

// export const ChatBot = () => {
//   const { toast } = useToast();
//   const [message, setMessage] = useState('');
//   const messagesEndRef = useRef<HTMLDivElement>(null);
  
//   const {
//     chatMessages,
//     isChatOpen,
//     isChatLoading,
//     setChatOpen,
//     addChatMessage,
//     setChatLoading,
//   } = useDashboardStore();

//   const scrollToBottom = () => {
//     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//   };

//   useEffect(() => {
//     scrollToBottom();
//   }, [chatMessages]);

//   const handleSendMessage = async () => {
//     if (!message.trim() || isChatLoading) return;

//     const userMessage = message.trim();
//     setMessage('');
//     addChatMessage(userMessage, true);
//     setChatLoading(true);

//     try {
//       // Mock API call - replace with actual chatbot endpoint
//       const response = await fetch('http://127.0.0.1:8000/api/chatbot/query', {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({ query: userMessage }),
//       });

//       if (!response.ok) {
//         throw new Error('Failed to get response from chatbot');
//       }

//       const data = await response.json();
      
//       // Simulate typing delay
//       setTimeout(() => {
//         addChatMessage(data.response || 'I understand your question. Let me help you with that!', false);
//         setChatLoading(false);
//       }, 1500);
      
//     } catch (err) {
//       // Mock response for demo
//       setTimeout(() => {
//         addChatMessage('I\'m here to help! You can ask me about database operations, data analysis, or any questions about managing your data.', false);
//         setChatLoading(false);
//       }, 1000);
      
//       toast({
//         title: "Connection Issue",
//         description: "Using demo mode. Real chatbot integration pending.",
//         variant: "default",
//       });
//     }
//   };

//   const handleKeyPress = (e: React.KeyboardEvent) => {
//     if (e.key === 'Enter' && !e.shiftKey) {
//       e.preventDefault();
//       handleSendMessage();
//     }
//   };

//   return (
//     <>
//       {/* Chat Toggle Button */}
//       {!isChatOpen && (
//         <Button
//           onClick={() => setChatOpen(true)}
//           className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-primary hover:bg-primary-hover shadow-elevation text-white transition-bounce z-50"
//           size="icon"
//         >
//           <MessageCircle className="w-6 h-6" />
//         </Button>
//       )}

//       {/* Chat Window */}
//       {isChatOpen && (
//         <Card className="fixed bottom-6 right-6 w-96 h-[500px] bg-white shadow-elevation border-0 z-50 flex flex-col">
//           <CardHeader className="bg-gradient-primary text-white rounded-t-lg">
//             <div className="flex items-center justify-between">
//               <div className="flex items-center space-x-2">
//                 <Bot className="w-5 h-5" />
//                 <CardTitle className="text-lg font-semibold">AI Assistant</CardTitle>
//               </div>
//               <Button
//                 onClick={() => setChatOpen(false)}
//                 size="icon"
//                 variant="ghost"
//                 className="text-white hover:bg-white/20 h-8 w-8"
//               >
//                 <X className="w-4 h-4" />
//               </Button>
//             </div>
//           </CardHeader>

//           <CardContent className="flex-1 p-0 flex flex-col">
//             {/* Messages */}
//             <div className="flex-1 overflow-y-auto p-4 space-y-4">
//               {chatMessages.map((msg) => (
//                 <div
//                   key={msg.id}
//                   className={`flex items-start space-x-2 ${
//                     msg.isUser ? 'justify-end' : 'justify-start'
//                   }`}
//                 >
//                   {!msg.isUser && (
//                     <div className="w-8 h-8 bg-gradient-primary rounded-full flex items-center justify-center flex-shrink-0">
//                       <Bot className="w-4 h-4 text-white" />
//                     </div>
//                   )}
                  
//                   <div
//                     className={`max-w-[80%] rounded-lg p-3 ${
//                       msg.isUser
//                         ? 'bg-gradient-primary text-white'
//                         : 'bg-muted text-foreground'
//                     }`}
//                   >
//                     <p className="text-sm">{msg.text}</p>
//                     <p className="text-xs opacity-70 mt-1">
//                       {msg.timestamp.toLocaleTimeString([], { 
//                         hour: '2-digit', 
//                         minute: '2-digit' 
//                       })}
//                     </p>
//                   </div>
                  
//                   {msg.isUser && (
//                     <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
//                       <User className="w-4 h-4 text-white" />
//                     </div>
//                   )}
//                 </div>
//               ))}
              
//               {/* Typing Indicator */}
//               {isChatLoading && (
//                 <div className="flex items-start space-x-2">
//                   <div className="w-8 h-8 bg-gradient-primary rounded-full flex items-center justify-center">
//                     <Bot className="w-4 h-4 text-white" />
//                   </div>
//                   <div className="bg-muted rounded-lg p-3">
//                     <div className="flex items-center space-x-1">
//                       <Loader2 className="w-4 h-4 animate-spin" />
//                       <span className="text-sm text-muted-foreground">Typing...</span>
//                     </div>
//                   </div>
//                 </div>
//               )}
//               <div ref={messagesEndRef} />
//             </div>

//             {/* Input */}
//             <div className="p-4 border-t border-border">
//               <div className="flex items-center space-x-2">
//                 <Input
//                   value={message}
//                   onChange={(e) => setMessage(e.target.value)}
//                   onKeyPress={handleKeyPress}
//                   placeholder="Ask me anything..."
//                   disabled={isChatLoading}
//                   className="flex-1 border-2 focus:border-primary transition-smooth"
//                 />
//                 <Button
//                   onClick={handleSendMessage}
//                   disabled={!message.trim() || isChatLoading}
//                   size="icon"
//                   className="bg-gradient-primary hover:bg-primary-hover text-white shadow-primary transition-smooth"
//                 >
//                   <Send className="w-4 h-4" />
//                 </Button>
//               </div>
//             </div>
//           </CardContent>
//         </Card>
//       )}
//     </>
//   );
// };
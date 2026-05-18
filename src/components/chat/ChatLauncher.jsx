import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import ChatFullscreen from './ChatFullscreen';

const ChatLauncher = () => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 bg-primary text-white px-5 py-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                title="Juntos Inteligence"
            >
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-medium">Juntos Inteligence</span>
            </button>
            <ChatFullscreen open={open} onClose={() => setOpen(false)} />
        </>
    );
};

export default ChatLauncher;

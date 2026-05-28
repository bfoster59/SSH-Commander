import React, { useState, useEffect, useRef, useMemo } from "react";
import { X, Search, ChevronDown, ChevronUp } from "lucide-react";
import { highlightCode } from "../lib/highlight";

interface FileViewerProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  filePath: string;
  content: string;
  isRemote: boolean;
  category?: 'text' | 'image' | 'pdf' | 'video' | 'audio';
  rawUrl?: string;
}

export default function FileViewer({ isOpen, onClose, fileName, filePath, content, isRemote, category = 'text', rawUrl = "" }: FileViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [matchIndexes, setMatchIndexes] = useState<number[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset query searches upon loading file
    setSearchQuery("");
    setMatchIndexes([]);
    setCurrentMatchIndex(-1);
  }, [filePath, content]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) {
      setMatchIndexes([]);
      setCurrentMatchIndex(-1);
      return;
    }

    const matches: number[] = [];
    const lowerContent = content.toLowerCase();
    const query = searchQuery.toLowerCase();
    let idx = lowerContent.indexOf(query);

    while (idx !== -1) {
      matches.push(idx);
      idx = lowerContent.indexOf(query, idx + 1);
    }

    setMatchIndexes(matches);
    if (matches.length > 0) {
      setCurrentMatchIndex(0);
      scrollToMatch(matches[0]);
    } else {
      setCurrentMatchIndex(-1);
    }
  };

  const scrollToMatch = (charIndex: number) => {
    if (!textRef.current) return;
    const textElement = textRef.current;
    
    // Fallback: estimate scrolling position based on line height
    const beforeText = content.substring(0, charIndex);
    const lineCount = beforeText.split("\n").length;
    
    const approxLineHeight = 20; // in pixels
    const targetScroll = (lineCount - 5) * approxLineHeight;
    textElement.scrollTo({
      top: Math.max(0, targetScroll),
      behavior: "smooth"
    });
  };

  const handleNextMatch = () => {
    if (matchIndexes.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % matchIndexes.length;
    setCurrentMatchIndex(nextIdx);
    scrollToMatch(matchIndexes[nextIdx]);
  };

  const handlePrevMatch = () => {
    if (matchIndexes.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + matchIndexes.length) % matchIndexes.length;
    setCurrentMatchIndex(prevIdx);
    scrollToMatch(matchIndexes[prevIdx]);
  };

  const highlighted = useMemo(
    () => (category === 'text' && content ? highlightCode(content, fileName) : ""),
    [category, content, fileName]
  );

  if (!isOpen) return null;

  const isText = category === 'text';
  const lines = content.split("\n");

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4" id="viewer-root">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl rounded-lg shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        
        {/* Title bar */}
        <div className="bg-slate-950 border-b border-slate-800 p-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] px-2 py-0.5 rounded bg-sky-900 border border-sky-700 text-sky-200">
              {isRemote ? "F3: REMOTE" : "F3: LOCAL"}
            </span>
            <h3 className="font-mono text-xs font-semibold text-slate-200 truncate" title={filePath}>
              {fileName}{isText ? ` (${lines.length} lines)` : ` (${category})`}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action/Search Bar (text only) */}
        {isText && (
        <div className="bg-slate-850 p-2 border-b border-slate-800 flex flex-wrap gap-2 items-center justify-between shrink-0">
          <form onSubmit={handleSearch} className="flex items-center bg-slate-950 border border-slate-700 rounded overflow-hidden w-full max-w-md">
            <input
              type="text"
              placeholder="Find text..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="px-2.5 py-1 text-xs text-white bg-transparent focus:outline-none w-full"
            />
            <button type="submit" className="p-1.5 text-slate-400 hover:text-white">
              <Search className="w-3.5 h-3.5" />
            </button>
          </form>

          {matchIndexes.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-slate-350">
              <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-sky-400">
                Match {currentMatchIndex + 1} of {matchIndexes.length}
              </span>
              <div className="flex gap-1">
                <button 
                  onClick={handlePrevMatch}
                  className="p-1 bg-slate-800 hover:bg-slate-750 text-white rounded transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={handleNextMatch}
                  className="p-1 bg-slate-800 hover:bg-slate-750 text-white rounded transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Content Box */}
        {isText ? (
        <div
          ref={textRef}
          className="flex-1 overflow-y-auto bg-slate-950 p-4 font-mono text-[12px] leading-relaxed text-slate-300 select-all"
        >
          {content === "" ? (
            <div className="text-center italic text-slate-500 py-12">Empty File</div>
          ) : (
            <div className="flex">
              {/* Line numbers Column */}
              <div className="text-right text-slate-650 select-none pr-4 border-r border-slate-850 mr-4 shrink-0 font-medium leading-[1.5rem]">
                {lines.map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>

              {/* Highlighted code */}
              <pre className="hljs overflow-x-auto whitespace-pre tab-size-4 flex-1 leading-[1.5rem] !bg-transparent !p-0">
                <code dangerouslySetInnerHTML={{ __html: highlighted }} />
              </pre>
            </div>
          )}
        </div>
        ) : (
        <div className="flex-1 overflow-auto bg-slate-950 flex items-center justify-center p-4">
          {category === 'image' && (
            <img src={rawUrl} alt={fileName} className="max-w-full max-h-full object-contain" />
          )}
          {category === 'pdf' && (
            <iframe src={rawUrl} title={fileName} className="w-full h-full min-h-[70vh] border-0 bg-white" />
          )}
          {category === 'video' && (
            <video src={rawUrl} controls className="max-w-full max-h-full" />
          )}
          {category === 'audio' && (
            <audio src={rawUrl} controls className="w-full" />
          )}
        </div>
        )}

        {/* Footer info banner */}
        <div className="bg-slate-950 border-t border-slate-850 p-2 text-[10px] text-slate-500 flex justify-between font-mono shrink-0">
          <span>Path: {filePath}</span>
          <span>Press ESC or Close to return</span>
        </div>
      </div>
    </div>
  );
}

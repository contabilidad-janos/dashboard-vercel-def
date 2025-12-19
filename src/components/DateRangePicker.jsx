/* src/components/DateRangePicker.jsx */
import React, { useState, useEffect, useRef } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, parseISO } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import 'react-day-picker/dist/style.css'; // Default styles

const DateRangePicker = ({
    startDate,
    endDate,
    onChange
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    // Convert strings (YYYY-MM-DD) to Date objects for the picker
    const [range, setRange] = useState({
        from: startDate ? parseISO(startDate) : undefined,
        to: endDate ? parseISO(endDate) : undefined
    });

    useEffect(() => {
        setRange({
            from: startDate ? parseISO(startDate) : undefined,
            to: endDate ? parseISO(endDate) : undefined
        });
    }, [startDate, endDate]);

    // Handle outside click to close
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (selectedRange) => {
        setRange(selectedRange);
        if (selectedRange?.from) {
            const fromStr = format(selectedRange.from, 'yyyy-MM-dd');
            let toStr = '';

            if (selectedRange.to) {
                toStr = format(selectedRange.to, 'yyyy-MM-dd');
            }

            // Pass partial or full range
            onChange(fromStr, toStr || fromStr);

            if (selectedRange.to) {
                // We have a complete range
                onChange(fromStr, format(selectedRange.to, 'yyyy-MM-dd'));
            }
        } else {
            setRange(undefined);
        }
    };

    // Custom CSS to mimic MUI styling + our custom calendar colors
    const customStyles = `
        /* Force round blue circle for ANY selected day (start, end, or single click) */
        .rdp-day_selected, 
        .rdp-day_range_start, 
        .rdp-day_range_end {
            background-color: #0ea5e9 !important;
            color: white !important;
            border-radius: 50% !important;
            font-weight: bold !important;
        }

        /* Middle of the range - light blue square */
        .rdp-day_range_middle {
            background-color: #e0f2fe !important;
            color: #0ea5e9 !important;
            border-radius: 0 !important;
        }

        /* Fix overlapping radii for start/end of range */
        .rdp-day_range_start {
            border-top-right-radius: 0 !important;
            border-bottom-right-radius: 0 !important;
        }
        .rdp-day_range_end {
            border-top-left-radius: 0 !important;
            border-bottom-left-radius: 0 !important;
        }

        /* Hover state for unselected days */
        .rdp-day:not(.rdp-day_selected):not(.rdp-day_range_middle):hover {
            background-color: #f3f4f6 !important;
            border-radius: 50%;
        }
    `;

    return (
        <div className="relative inline-block" ref={containerRef}>
            <style>{customStyles}</style>

            {/* Simulated MUI Container */}
            <div
                className="flex items-center gap-2 bg-white border border-gray-300 rounded-md p-1 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all cursor-pointer"
                onClick={() => setIsOpen(true)}
            >
                {/* Start Date Input-lookalike */}
                <div className="relative group px-3 py-1.5 flex-1 min-w-[120px]">
                    <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-0.5">Start</div>
                    <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                        <CalendarIcon className="w-4 h-4 text-gray-400" />
                        {range?.from ? format(range.from, 'MM/dd/yyyy') : <span className="text-gray-400">MM/DD/YYYY</span>}
                    </div>
                </div>

                {/* Divider */}
                <div className="w-px h-8 bg-gray-200"></div>

                {/* End Date Input-lookalike */}
                <div className="relative group px-3 py-1.5 flex-1 min-w-[120px]">
                    <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-0.5">End</div>
                    <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                        <CalendarIcon className="w-4 h-4 text-gray-400" />
                        {range?.to ? format(range.to, 'MM/dd/yyyy') : <span className="text-gray-400">MM/DD/YYYY</span>}
                    </div>
                </div>
            </div>

            {/* Popup Calendar */}
            {isOpen && (
                <div className="absolute z-50 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 p-4 animate-in fade-in zoom-in-95 duration-200 left-0">
                    <DayPicker
                        mode="range"
                        defaultMonth={range?.from || new Date()}
                        selected={range}
                        onSelect={handleSelect}
                        showOutsideDays
                        modifiersClassNames={{
                            selected: 'my-selected',
                            range_start: 'rdp-day_range_start',
                            range_end: 'rdp-day_range_end',
                            range_middle: 'rdp-day_range_middle'
                        }}
                        styles={{
                            caption: { color: '#374151' }
                        }}
                    />
                    <div className="text-right mt-2 border-t pt-2">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsOpen(false);
                            }}
                            className="text-xs font-semibold text-primary hover:text-primary/80"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DateRangePicker;

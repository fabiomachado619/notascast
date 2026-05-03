import React, { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';

const Clock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timerId = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, []);

  const optionsNumeric = {
    timeZone: 'America/Cuiaba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };

  const optionsText = {
    timeZone: 'America/Cuiaba',
    weekday: 'long',
    month: 'long',
  };

  const formatterNumeric = new Intl.DateTimeFormat('pt-BR', optionsNumeric);
  const parts = formatterNumeric.formatToParts(time);
  const datePart = parts.find(p => p.type === 'day').value + '/' + parts.find(p => p.type === 'month').value + '/' + parts.find(p => p.type === 'year').value;
  const timePart = parts.find(p => p.type === 'hour').value + ':' + parts.find(p => p.type === 'minute').value + ':' + parts.find(p => p.type === 'second').value;

  const formatterText = new Intl.DateTimeFormat('pt-BR', optionsText);
  const textParts = formatterText.formatToParts(time);
  const weekdayPart = textParts.find(p => p.type === 'weekday').value;
  const monthPart = textParts.find(p => p.type === 'month').value;

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="flex items-center gap-2 rounded-full bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-gray-800 dark:text-gray-200 shadow-sm print:hidden">
      <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      <div className="text-left">
        <p className="whitespace-nowrap">{datePart} • {timePart} • UTC−04:00 — Cuiabá, Mato Grosso</p>
        <p className="whitespace-nowrap">{capitalize(weekdayPart)} • {capitalize(monthPart)}</p>
      </div>
    </div>
  );
};

export default Clock;
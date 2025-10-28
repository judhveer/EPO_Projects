import React from "react";

export default function QuestionCard({ question, onSelect, selected }) {
  return (
    <div className="bg-white p-5 rounded-xl shadow mb-5 border">
      <h3 className="text-lg font-semibold mb-3">
        {question.id}. {question.question}
      </h3>

      <div className="grid gap-3">
        {question.options.map((opt, i) => (
          <label
            key={i}
            className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition 
              ${
                selected?.optionIndex === i && selected?.id === question.id
                  ? "bg-blue-100 border-blue-500"
                  : "hover:bg-gray-50"
              }`}
          >
            <input
              type="radio"
              name={`q-${question.id}`}
              value={opt.type}
              checked={
                selected?.optionIndex === i && selected?.id === question.id
              }
              onChange={() => onSelect(question.id, opt.type, i)}
              className="accent-blue-600"
            />
            {opt.text}
          </label>
        ))}
      </div>
    </div>
  );
}

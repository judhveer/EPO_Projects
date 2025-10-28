import React, { useEffect, useState } from "react";
import api  from "../../lib/api";
import QuestionCard from "../../components/discTest/QuestionCard";
import { useNavigate } from "react-router-dom";


export default function DiscTest() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    dob: "",
  });

  useEffect(() => {
    const fetchQuestions = async () => {
      const res = await api.get("/api/disc/questions");
      setQuestions(res.data);
      setLoading(false);
    };
    fetchQuestions();
  }, []);

  const handleSelect = (qid, type, optionIndex) => {
    setAnswers((prev) => [
      ...prev.filter((a) => a.id !== qid),
      { id: qid, type, optionIndex },
    ]);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.mobile || !formData.dob) {
      alert("Please fill all fields before submitting.");
      return;
    }

    if (answers.length < questions.length) {
      alert("Please answer all questions before submitting.");
      return;
    }

    try {
      setSubmitted(true);
      await api.post("/api/disc/submit", { ...formData, answers });
      alert("✅ Report generated & sent to your boss!");
      navigate("/home");
    } catch (error) {
      console.error(error);

      if (error.response?.status === 409) {
        alert(
          "❌ You have already completed the DISC Personality Test.\nMultiple submissions are not allowed.\nPlease contact HR if needed."
        );
      } else {
        alert(
          "❌ Something went wrong while submitting the form. Please try again later."
        );
      }
    } finally {
      setSubmitted(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center items-center min-h-screen text-xl">
        Loading questions...
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-center mb-8 text-blue-800">
        DISC Personality Test
      </h1>

      {/* User Info */}
      {/* User Info */}
      <div className="bg-gray-100 p-5 rounded-xl mb-6 shadow">
        <h2 className="font-semibold mb-4 text-lg">Your Details</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Your Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="p-3 border rounded"
          />
          <input
            type="text"
            placeholder="Mobile No."
            value={formData.mobile}
            onChange={(e) =>
              setFormData({ ...formData, mobile: e.target.value })
            }
            className="p-3 border rounded"
          />

          {/* ✅ Date Input with Label */}
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              Date of Birth
            </label>
            <input
              type="date"
              value={formData.dob}
              onChange={(e) =>
                setFormData({ ...formData, dob: e.target.value })
              }
              className="p-3 border rounded"
            />
          </div>
        </div>
      </div>

      {/* Questions */}
      {questions.map((q) => (
        <QuestionCard
          key={q.id}
          question={q}
          selected={answers.find((a) => a.id === q.id)}
          onSelect={handleSelect}
        />
      ))}

      {/* Submit */}
      <div className="text-center mt-6">
        <button
          disabled={submitted}
          onClick={handleSubmit}
          className={`px-8 py-3 rounded-lg font-semibold text-white ${
            submitted ? "bg-gray-400" : "bg-blue-700 hover:bg-blue-800"
          }`}
        >
          {submitted ? "Submitting..." : "Submit & Generate Report"}
        </button>
      </div>
    </div>
  );
}

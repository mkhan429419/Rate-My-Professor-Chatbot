import React, { useState } from "react";
import { X } from "react-feather";

interface UrlInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (url: string) => void;
}

const UrlInputModal: React.FC<UrlInputModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [url, setUrl] = useState("");
  const [isValidUrl, setIsValidUrl] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const validateUrl = (inputUrl: string) => {
    const regex = /^https:\/\/www\.ratemyprofessors\.com\/professor\/\d+$/;
    return regex.test(inputUrl);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputUrl = e.target.value;
    setUrl(inputUrl);
    setIsValidUrl(validateUrl(inputUrl));
  };

  const handleSave = async () => {
    if (isValidUrl) {
      try {
        const response = await fetch("/api/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
        });

        if (response.ok) {
          setStatusMessage("Professor data has been successfully added!");
        } else {
          setStatusMessage("Failed to add professor data.");
        }
      } catch (error) {
        console.error("Error:", error);
        setStatusMessage("An error occurred while saving the professor data.");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-[450px] p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-800">
            Add Professor
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>

        <div className="mb-6">
          <label
            htmlFor="professorUrl"
            className="block text-sm font-medium text-gray-700"
          >
            RateMyProfessor URL
          </label>
          <input
            type="text"
            id="professorUrl"
            placeholder="Enter the URL"
            className={`mt-2 block w-full px-4 py-3 border rounded-lg shadow-sm focus:outline-none ${
              isValidUrl === null
                ? "border-gray-300"
                : isValidUrl
                ? "border-green-500 focus:ring-green-500 focus:border-green-500"
                : "border-red-500 focus:ring-red-500 focus:border-red-500"
            } text-gray-900 sm:text-base`}
            value={url}
            onChange={handleUrlChange}
          />
          {isValidUrl === false && (
            <p className="text-red-600 text-sm mt-2">
              Invalid RateMyProfessor URL. Please enter a valid URL.
            </p>
          )}
          {isValidUrl === true && (
            <p className="text-green-600 text-sm mt-2">This is a valid URL!</p>
          )}
        </div>

        {statusMessage && (
          <p className="text-sm mt-2 text-gray-700">{statusMessage}</p>
        )}

        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={`px-4 py-2 rounded-lg transition duration-150 ${
              isValidUrl
                ? "bg-violet-600 text-white hover:bg-violet-700"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
            disabled={!isValidUrl}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default UrlInputModal;

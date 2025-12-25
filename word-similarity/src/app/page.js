'use client';

import { useState, useMemo, useCallback } from 'react';
import WordCloud from 'react-d3-cloud';

const MAX_FONT_SIZE = 60;
const MIN_FONT_SIZE = 14;
const MAX_FONT_WEIGHT = 700;
const MIN_FONT_WEIGHT = 400;
const MAX_WORDS = 150;

export default function Home() {
  const [keywords, setKeywords] = useState('');
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const sortedWords = useMemo(
    () => words.slice(0, MAX_WORDS),
    [words]
  );

  console.log("Sorted Words:", sortedWords);

  const [minOccurences, maxOccurences] = useMemo(() => {
    if (sortedWords.length === 0) return [0, 0];

    const occurences = sortedWords.map((w) => w.value);
    const min = Math.min(...occurences);
    const max = Math.max(...occurences);

    return [min, max];
  }, [sortedWords]);

  const calculateFontSize = useCallback(
    (wordOccurrences) => {
      if (maxOccurences === minOccurences || maxOccurences === 0) {
        return MIN_FONT_SIZE;
      }

      const normalizedValue =
        (wordOccurrences - minOccurences) / (maxOccurences - minOccurences);

      const fontSize =
        MIN_FONT_SIZE + normalizedValue * (MAX_FONT_SIZE - MIN_FONT_SIZE);

      return Math.round(fontSize);
    },
    [maxOccurences, minOccurences]
  );

  const calculateFontWeight = useCallback(
    (wordOccurrences) => {
      if (maxOccurences === minOccurences || maxOccurences === 0) {
        return MIN_FONT_WEIGHT;
      }

      const normalizedValue =
        (wordOccurrences - minOccurences) / (maxOccurences - minOccurences);

      const fontWeight =
        MIN_FONT_WEIGHT +
        normalizedValue * (MAX_FONT_WEIGHT - MIN_FONT_WEIGHT);

      return Math.round(fontWeight);
    },
    [maxOccurences, minOccurences]
  );

  // Transform data untuk WordCloud dengan fontSize yang sudah dihitung
  const wordCloudData = useMemo(() => {
    return sortedWords.map(word => ({
      text: word.text,
      value: calculateFontSize(word.value) // Gunakan fontSize yang sudah dihitung
    }));
  }, [sortedWords, calculateFontSize]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setWords([]);

    const keywordArray = keywords.split(',').map(k => k.trim()).filter(k => k);

    if (keywordArray.length === 0) {
      setError("Silakan masukkan setidaknya satu kata kunci.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('http://127.0.0.1:5000/api/get-similar-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: keywordArray,
          top_n: 50
        }),
      });

      if (!response.ok) throw new Error(`Gagal terhubung ke server: ${response.statusText}`);

      const data = await response.json();
      console.log("Data received from API:", data);

      if (!data || data.length === 0) {
        setError("Tidak ada kata relevan yang ditemukan.");
      } else {
        setWords(data);
      }

    } catch (err) {
      console.error(err);
      setError("Terjadi kesalahan. Pastikan server backend (app.py) berjalan.");
    } finally {
      setLoading(false);
    }
  };

  console.log("FontSize test:", sortedWords.map(w => calculateFontSize(w.value)));
  console.log("WordCloud data:", wordCloudData);

  return (
    <main className="font-sans flex flex-col items-center min-h-screen p-8 sm:p-12 bg-gray-50">
      <div className="w-full max-w-4xl">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Word Cloud Generator</h1>
          <p className="text-lg text-gray-600">Temukan kata-kata yang relevan dari input Anda</p>
        </header>

        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <form onSubmit={handleSubmit}>
            <label htmlFor="keywords" className="block text-sm font-medium text-gray-700 mb-2">
              Masukkan Kata Kunci (pisahkan dengan koma)
            </label>
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                id="keywords"
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Contoh: demo, dpr, mahasiswa"
                className="flex-grow w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 transition text-black"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition"
              >
                {loading ? 'Memproses...' : 'Generate'}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md w-full min-h-[500px] flex items-center justify-center">
          {loading && <p className="text-gray-500">Loading Word Cloud...</p>}
          {error && <p className="text-red-500 font-semibold">{error}</p>}
          {!loading && !error && wordCloudData.length > 0 && (
            <div className="w-full h-[500px] overflow-hidden">
              <WordCloud
                data={wordCloudData}
                width={800}
                height={500}
                font="Poppins"
                fontWeight={(word) => 600}
                fontSize={(word) => word.value}
                rotate={(word) => (Math.random() - 0.5) * 60}
                padding={3}
                random={() => 0.5}
                fill={(d, i) => {
                  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316'];
                  return colors[i % colors.length];
                }}
                onWordClick={(event, d) => {
                  console.log('Word clicked:', d.text);
                }}
              />
            </div>
          )}
          {!loading && !error && words.length === 0 && (
            <p className="text-gray-400">Hasil word cloud akan muncul di sini</p>
          )}
        </div>
      </div>
    </main>
  );
}
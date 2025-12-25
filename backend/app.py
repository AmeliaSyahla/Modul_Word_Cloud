import pandas as pd
import re
import string
import json
import numpy as np
import os
from sklearn.metrics.pairwise import cosine_similarity
from tensorflow.keras.preprocessing.text import Tokenizer
from flask import Flask, request, jsonify
from flask_cors import CORS
import nltk
from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
import warnings

warnings.filterwarnings('ignore')

# Download resource NLTK secara aman

print("Download...")
nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)
nltk.download('stopwords', quiet=True)
print("download NLTK selesai.")

# =====================================================================================
# 1. INISIALISASI & KONFIGURASI APLIKASI FLASK
# =====================================================================================
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# =====================================================================================
# 2. FUNGSI-FUNGSI PREPROCESSING (HELPER FUNCTIONS)
# =====================================================================================

# Inisialisasi Stemmer dan Stopwords (didefinisikan sekali untuk efisiensi)
factory = StemmerFactory()
stemmer = factory.create_stemmer()

stopwords_indonesian = set(nltk.corpus.stopwords.words('indonesian'))
# MODIFIKASI: drop_list dari fungsi cleaning Anda digabungkan ke sini
custom_stopwords = {'deh', 'ah', 'sih', 'nya', 'ya', 'kok', 'nih', 'dong', 'tuh', 'iya', 'nice', 'people', 'scroll', 'to', 'continue', 'with', 'content'}
stopwords_list = stopwords_indonesian.union(custom_stopwords)

path_slang = 'combined_slang_words.txt'

# kamus normalisasi dari combined_slang_words.txt
slang_dict = {}
try:
    with open(path_slang, 'r') as f:
        slang_dict = json.load(f)
    print(f"Berhasil memuat {len(slang_dict)} kata dari kamus slang.")
except (json.JSONDecodeError, FileNotFoundError) as e:
    print(f"Gagal memuat kamus slang: {e}.")
    
df = pd.read_pickle('stemming.pkl')

def build_tokenizer(): #tahap preprocessing dilewati, langsung pake stemming.pkl
    corpus = df['Content_clean'].apply(" ".join).tolist()
    print("Preprocessing selesai.")

    print("Membangun tokenizer...")
    word_tokenizer = Tokenizer(oov_token="<OOV>")
    word_tokenizer.fit_on_texts(corpus)
    vocab_length = len(word_tokenizer.word_index) + 1
    print(f"Vocabulary berhasil dibangun dengan {vocab_length-1} kata unik.")

    print("Memuat model GloVe...")
    embeddings_dictionary = {}
    embedding_dim = 50
    glove_path = "token_vectors.txt"
    try:
        with open(glove_path, "r", encoding="utf8") as f:
            for line in f:
                records = line.strip().split()
                if len(records) < embedding_dim + 1:
                    continue  # skip baris rusak / tidak lengkap

                word = records[0]
                numbers = records[1:1+embedding_dim]  # ambil hanya 50 angka pertama

                try:
                    vector_dimensions = np.asarray(numbers, dtype='float32')
                except ValueError:
                    print(f"❌ Skip baris rusak: {records[:5]}")
                    continue

                if vector_dimensions.shape[0] == embedding_dim:
                    embeddings_dictionary[word] = vector_dimensions

    except FileNotFoundError:
        print(f"Error fatal: File GloVe '{glove_path}' tidak ditemukan.")
        embeddings_dictionary = None

        
    print("Membuat embedding matrix...")
    embedding_matrix = np.zeros((vocab_length, embedding_dim))
    for word, index in word_tokenizer.word_index.items():
        embedding_vector = embeddings_dictionary.get(word)
        if embedding_vector is not None:
            embedding_matrix[index] = embedding_vector
            
    print("✅ Setup model selesai dan siap menerima permintaan.")
    return word_tokenizer, embedding_matrix

WORD_TOKENIZER, EMBEDDING_MATRIX = build_tokenizer()

@app.route('/', methods=['GET'])
def index():
    return jsonify({"message": "API for NLP Word Embedding is running!"})

@app.route('/api/get-similar-words', methods=['POST'])
def get_similar_words():
    if WORD_TOKENIZER is None or EMBEDDING_MATRIX is None:
        return jsonify({"error": "Model tidak berhasil dimuat, periksa log server."}), 500

    data = request.get_json()
    if not data or 'keywords' not in data or not isinstance(data['keywords'], list):
        return jsonify({"error": "Request body harus berisi JSON object dengan key 'keywords' yang berupa array."}), 400

    keywords = data['keywords']
    top_n = data.get('top_n', 15)
    all_similar_words = {}

    for keyword in keywords:
        processed_keyword = stemmer.stem(keyword.lower())
        if processed_keyword not in WORD_TOKENIZER.word_index:
            continue

        idx = WORD_TOKENIZER.word_index[processed_keyword]
        word_vec = EMBEDDING_MATRIX[idx].reshape(1, -1)
        
        similarities = cosine_similarity(word_vec, EMBEDDING_MATRIX)[0]
        similar_indices = similarities.argsort()[-top_n-1:-1][::-1]

        for i in similar_indices:
            word = WORD_TOKENIZER.index_word.get(i)
            if word:
                score = float(similarities[i])
                if word not in all_similar_words or score > all_similar_words[word]:
                    all_similar_words[word] = score

    sorted_words = sorted(all_similar_words.items(), key=lambda item: item[1], reverse=True)
    wordcloud_data = [{"text": word, "value": score} for word, score in sorted_words[:top_n]]

    return jsonify(wordcloud_data)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer

app = Flask(__name__)
model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')

@app.route('/embed', methods=['POST'])
def embed():
    data = request.get_json()
    texts = data.get('texts', [])
    if not texts:
        return jsonify({'error': 'No texts provided'}), 400
    embeddings = model.encode(texts, show_progress_bar=False).tolist()
    return jsonify({'embeddings': embeddings})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
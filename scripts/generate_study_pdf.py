"""
Generate comprehensive study PDF:
  - AI / ML Fundamentals (Parts 1-31)
  - DBMS Fundamentals (Sections 1.1-1.11)
  - Computer Networks (Sections 2.1-2.16)

Uses PyMuPDF fitz.Story (HTML -> PDF renderer).
Output: docs/CS_Study_Guide.pdf
"""

import fitz
import os

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "docs", "CS_Study_Guide.pdf")
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

CSS = """
body      { font-family: Helvetica, Arial, sans-serif; font-size: 11pt;
             line-height: 1.6; color: #1a1a1a; margin: 0; }
h1        { font-size: 22pt; color: #1a2744; margin-top: 28pt; margin-bottom: 6pt;
             border-bottom: 2px solid #e8511a; padding-bottom: 4pt; }
h2        { font-size: 17pt; color: #1a2744; margin-top: 22pt; margin-bottom: 4pt;
             border-left: 4px solid #e8511a; padding-left: 8pt; }
h3        { font-size: 13pt; color: #2c3e6b; margin-top: 16pt; margin-bottom: 3pt; }
h4        { font-size: 11pt; color: #3a4a7a; margin-top: 12pt; margin-bottom: 2pt;
             font-style: italic; }
p         { margin: 4pt 0 6pt 0; }
ul, ol    { margin: 4pt 0 6pt 18pt; padding: 0; }
li        { margin-bottom: 3pt; }
code      { font-family: Courier, monospace; font-size: 9.5pt;
             background: #f4f4f4; padding: 1pt 3pt; }
pre       { font-family: Courier, monospace; font-size: 9pt;
             background: #f4f4f4; border-left: 3px solid #e8511a;
             padding: 8pt; margin: 8pt 0; white-space: pre-wrap; }
table     { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 10pt; }
th        { background: #1a2744; color: #ffffff; padding: 5pt 7pt;
             text-align: left; }
td        { border: 1px solid #cccccc; padding: 4pt 7pt; }
tr:nth-child(even) td { background: #f8f8f8; }
.cover    { text-align: center; margin-top: 80pt; }
.cover h1 { font-size: 32pt; border: none; color: #1a2744; }
.cover h2 { font-size: 16pt; border: none; color: #e8511a; }
.cover p  { font-size: 11pt; color: #555; margin-top: 30pt; }
.part-title { font-size: 26pt; color: #e8511a; text-align: center;
               margin-top: 60pt; margin-bottom: 20pt;
               border-top: 3px solid #1a2744;
               border-bottom: 3px solid #1a2744;
               padding: 12pt 0; }
.note     { background: #fff8f0; border-left: 4px solid #e8511a;
             padding: 6pt 10pt; margin: 8pt 0; font-size: 10pt; }
.formula  { font-family: Courier, monospace; font-size: 10pt;
             background: #eef4ff; border: 1px solid #aac0ee;
             padding: 6pt 10pt; margin: 6pt 0; }
"""

HTML = """
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body>

<!-- ═══════════════════════════ COVER ═══════════════════════════ -->
<div class="cover">
  <h1>Complete Computer Science Study Guide</h1>
  <h2>AI &amp; ML &nbsp;|&nbsp; DBMS &nbsp;|&nbsp; Computer Networks</h2>
  <p>Comprehensive reference from fundamentals to advanced topics.<br/>
     Covers Supervised Learning, Deep Learning, Transformers, LLMs,<br/>
     RL / GRPO, Database Design, Normalization, OSI Model,<br/>
     Subnetting, Protocols, and more.</p>
  <p style="margin-top:60pt; font-size:9pt; color:#888;">
     Generated for interview and exam preparation.</p>
</div>

<p style="page-break-after:always;"></p>

<!-- ═══════════════════════════ PART I: AI & ML ═══════════════════════════ -->
<div class="part-title">PART I: Artificial Intelligence &amp; Machine Learning</div>

<h1>1. What is Machine Learning?</h1>

<h2>1.1 Core Idea</h2>
<p><strong>Traditional programming:</strong> you write rules → computer applies rules to data → output.</p>
<p><strong>Machine Learning:</strong> you give data + outputs → computer <em>finds the rules itself</em>.</p>
<p>The "rules" are parameters (weights) inside a model. Training = adjusting weights until model output matches desired output.</p>

<h2>1.2 Three Learning Paradigms</h2>
<table>
<tr><th>Paradigm</th><th>Description</th><th>Examples</th></tr>
<tr><td><strong>Supervised Learning</strong></td><td>Labeled data. Learn mapping f(x) → y.</td><td>Image classification, spam detection, MCQ generation</td></tr>
<tr><td><strong>Unsupervised Learning</strong></td><td>No labels. Find structure in raw data.</td><td>Clustering (k-means), PCA, autoencoders</td></tr>
<tr><td><strong>Reinforcement Learning</strong></td><td>Agent takes actions, gets rewards. Learn policy: state → action maximizing cumulative reward.</td><td>AlphaGo, ChatGPT alignment (RLHF), game AI</td></tr>
</table>

<h1>2. Math Foundations</h1>

<h2>2.1 Tensors</h2>
<ul>
<li><strong>Scalar:</strong> single number. x = 3.14</li>
<li><strong>Vector:</strong> 1D array. x = [1, 2, 3], shape (3,)</li>
<li><strong>Matrix:</strong> 2D array. Shape (rows, cols) e.g. (512, 768)</li>
<li><strong>Tensor:</strong> N-dimensional generalization. Batch of images: shape (batch, channels, H, W) = 4D tensor</li>
</ul>

<h2>2.2 Dot Product</h2>
<div class="formula">a · b = Σ aᵢbᵢ = |a||b|cos(θ)</div>
<p>Measures alignment between vectors. If a · b = 0, orthogonal (unrelated). If high, similar direction. Core of attention mechanisms.</p>

<h2>2.3 Activation Functions</h2>
<p>Add <strong>nonlinearity</strong>. Without them, stacking linear layers = still just one linear layer. Useless for learning complex patterns.</p>

<table>
<tr><th>Function</th><th>Formula</th><th>Range</th><th>Use / Notes</th></tr>
<tr><td><strong>Sigmoid</strong></td><td>σ(x) = 1/(1+e<sup>-x</sup>)</td><td>(0, 1)</td><td>Binary classification output. Problem: vanishing gradient at extremes.</td></tr>
<tr><td><strong>Tanh</strong></td><td>(e<sup>x</sup> - e<sup>-x</sup>)/(e<sup>x</sup> + e<sup>-x</sup>)</td><td>(-1, 1)</td><td>Better than sigmoid but still saturates.</td></tr>
<tr><td><strong>ReLU</strong></td><td>max(0, x)</td><td>[0, ∞)</td><td>Default hidden layers. Fast. Problem: dying ReLU if always negative input.</td></tr>
<tr><td><strong>LeakyReLU</strong></td><td>max(0.01x, x)</td><td>(-∞, ∞)</td><td>Fixes dying ReLU with small negative slope.</td></tr>
<tr><td><strong>GELU</strong></td><td>x × Φ(x)</td><td>(-∞, ∞)</td><td>Used in GPT, BERT. Smooth. Empirically best for transformers.</td></tr>
<tr><td><strong>SiLU/Swish</strong></td><td>x × σ(x)</td><td>(-∞, ∞)</td><td>Used in LLaMA, Mistral.</td></tr>
<tr><td><strong>SoftMax</strong></td><td>e<sup>xi</sup> / Σ e<sup>xj</sup></td><td>(0,1), sums to 1</td><td>Multi-class output. Also in attention.</td></tr>
</table>

<h2>2.4 Loss Functions</h2>
<p>Loss = how wrong the model is. Training = minimize loss.</p>
<table>
<tr><th>Loss</th><th>Formula</th><th>Use</th></tr>
<tr><td>MSE</td><td>(1/n) Σ (ŷ - y)<sup>2</sup></td><td>Regression</td></tr>
<tr><td>Cross-Entropy</td><td>-Σ y × log(ŷ)</td><td>Multi-class classification</td></tr>
<tr><td>Binary Cross-Entropy</td><td>-[y log(ŷ) + (1-y)log(1-ŷ)]</td><td>Binary classification</td></tr>
</table>

<h1>3. Forward Propagation</h1>
<p>Data flows forward through layers producing prediction.</p>

<h2>3.1 Single Neuron</h2>
<div class="formula">output = activation(W · x + b)</div>
<p>W = weights, b = bias, x = input.</p>

<h2>3.2 Multi-Layer Perceptron (MLP)</h2>
<pre>Layer 1: h1 = activation(W1 · x + b1)
Layer 2: h2 = activation(W2 · h1 + b2)
Layer 3: y_hat = softmax(W3 · h2 + b3)</pre>
<p>Each layer applies learned linear transformation then nonlinearity.</p>
<ul>
<li><strong>Early layers:</strong> simple patterns (edges, common tokens)</li>
<li><strong>Middle layers:</strong> combinations (shapes, phrases)</li>
<li><strong>Late layers:</strong> high-level concepts (cat vs dog, topic classification)</li>
</ul>

<h1>4. Backward Propagation</h1>

<h2>4.1 The Problem</h2>
<p>We have loss L. We need: how does each weight w affect L? Use <strong>gradient</strong> = ∂L/∂w. Gradient tells direction of steepest increase. Go opposite direction to reduce loss.</p>

<h2>4.2 Chain Rule</h2>
<div class="formula">∂L/∂w = (∂L/∂h) × (∂h/∂w)</div>
<p>For multi-layer network:</p>
<div class="formula">∂L/∂W1 = (∂L/∂ŷ) × (∂ŷ/∂h2) × (∂h2/∂h1) × (∂h1/∂W1)</div>
<p>Error propagates backward from output → input. Hence "backpropagation."</p>

<h2>4.3 Steps</h2>
<ol>
<li>Forward pass: compute all layer outputs, store them</li>
<li>Compute loss L = CrossEntropy(ŷ, y)</li>
<li>Compute ∂L/∂ŷ — gradient at output</li>
<li>Walk backward applying chain rule at each layer</li>
<li>Accumulate gradients for every W and b</li>
</ol>

<h2>4.4 Vanishing Gradient Problem</h2>
<p>Chain rule multiplies gradients. Sigmoid/tanh saturate → derivative → 0. Multiply many near-zeros → gradient at early layers ≈ 0. Early layers stop learning.</p>
<p><strong>Solutions:</strong> ReLU, residual connections (skip connections), batch normalization, Xavier/He initialization.</p>

<h2>4.5 Exploding Gradient Problem</h2>
<p>Gradients grow exponentially → NaN instability.</p>
<p><strong>Solution:</strong> gradient clipping: if ‖grad‖ > threshold, scale down.</p>

<h1>5. Gradient Descent — All Variants</h1>

<h2>5.1 Core Update Rule</h2>
<div class="formula">w ← w - η × ∂L/∂w</div>
<p>η (eta) = learning rate. Size of each step.</p>

<table>
<tr><th>Variant</th><th>Batch Size</th><th>Pros</th><th>Cons</th></tr>
<tr><td>Batch GD</td><td>Full dataset</td><td>Stable gradient</td><td>Impractical for large datasets</td></tr>
<tr><td>SGD</td><td>1 sample</td><td>Fast, online</td><td>High variance, noisy</td></tr>
<tr><td>Mini-Batch GD</td><td>32–2048</td><td>Efficient GPU use + reasonable variance</td><td>Needs LR tuning</td></tr>
</table>

<h2>5.2 Momentum</h2>
<div class="formula">v ← β × v + (1-β) × grad
w ← w - η × v     (β ≈ 0.9)</div>
<p>Builds speed in consistent gradient direction, dampens oscillations. Like a ball rolling downhill with inertia.</p>

<h2>5.3 RMSProp</h2>
<div class="formula">E[g²] ← β × E[g²] + (1-β) × grad²
w ← w - (η / √(E[g²] + ε)) × grad</div>
<p>Adaptive per-parameter learning rates. Parameters with large gradient history get smaller effective LR.</p>

<h2>5.4 Adam (Adaptive Moment Estimation)</h2>
<p>Adam = Momentum + RMSProp. Maintains first moment m (mean of gradients) and second moment v (mean of squared gradients).</p>
<div class="formula">m ← β₁ × m + (1-β₁) × grad           (β₁ = 0.9)
v ← β₂ × v + (1-β₂) × grad²          (β₂ = 0.999)
m̂ = m / (1-β₁ᵗ)                       (bias correction)
v̂ = v / (1-β₂ᵗ)
w ← w - η × m̂ / (√v̂ + ε)             (ε = 1e-8)</div>
<p><strong>AdamW:</strong> Adam + correct weight decay (applied directly to weights, not via gradient). Used in GPT, BERT, LLaMA.</p>

<h2>5.5 Learning Rate Schedulers</h2>
<ul>
<li><strong>Warmup:</strong> start tiny, ramp up. Prevents early instability.</li>
<li><strong>Cosine decay:</strong> LR follows cosine curve peak → near-0. Standard in LLM training.</li>
<li><strong>Linear decay / Step decay:</strong> alternatives.</li>
</ul>

<h1>6. Regularization</h1>

<table>
<tr><th>Technique</th><th>How</th><th>Effect</th></tr>
<tr><td>L2 / Weight Decay</td><td>Add λΣw² to loss</td><td>Pushes weights toward 0, prevents over-reliance on any feature</td></tr>
<tr><td>Dropout</td><td>Randomly zero neurons with prob p during training</td><td>Forces redundancy, acts like ensemble of sub-networks</td></tr>
<tr><td>Batch Normalization</td><td>Normalize activations within batch, learnable scale+shift</td><td>Stable training, less sensitive to init</td></tr>
<tr><td>Layer Normalization</td><td>Normalize across features of single example</td><td>Used in transformers (batch norm fails on variable-length sequences)</td></tr>
</table>

<h1>7. Convolutional Neural Networks (CNNs)</h1>
<p>Specialized for grid data (images, 1D signals).</p>
<ul>
<li><strong>Convolution:</strong> slide small filter across input, compute dot product. Learns local patterns.</li>
<li><strong>Weight sharing:</strong> same kernel everywhere → huge parameter reduction vs fully-connected.</li>
<li><strong>Translation invariance:</strong> pattern detected regardless of position.</li>
<li><strong>Pooling:</strong> downsample feature maps. Max pool = max in each region.</li>
</ul>
<pre>Input image → Conv → ReLU → Pool → Conv → ReLU → Pool → Flatten → FC → Softmax</pre>

<h1>8. Recurrent Neural Networks (RNNs)</h1>
<p>For sequential data. At each timestep, takes input + previous hidden state:</p>
<div class="formula">hₜ = tanh(Wx × xₜ + Wh × hₜ₋₁ + b)</div>
<p><strong>Problem:</strong> vanishing gradient over long sequences (BPTT multiplies many Wh terms). Standard RNNs forget long-range context.</p>

<h2>8.1 LSTM (Long Short-Term Memory)</h2>
<p>Adds cell state C — a separate memory highway with gated updates:</p>
<ul>
<li><strong>Forget gate:</strong> f = σ(Wf × [h,x] + b) — how much old memory to keep</li>
<li><strong>Input gate:</strong> i = σ(Wi × [h,x] + b) — what new info to write</li>
<li><strong>Cell update:</strong> C = f⊙C_prev + i⊙tanh(Wc × [h,x] + b)</li>
<li><strong>Output gate:</strong> what to expose as hidden state</li>
</ul>
<p>Solves vanishing gradient — cell state gradients can flow unchanged through forget gate (when f≈1).</p>

<h2>8.2 GRU (Gated Recurrent Unit)</h2>
<p>Simplified LSTM — fewer gates, fewer parameters, similar performance. Both largely obsolete for NLP — transformers beat them decisively by 2019.</p>

<h1>9. Attention Mechanism</h1>

<h2>9.1 Problem with RNNs</h2>
<p>Encoder compresses entire input into single fixed-size vector. Long sequences → information bottleneck. Word meaning depends on distant context ("bank" meaning depends on "river" 10 words away).</p>

<h2>9.2 Basic Attention</h2>
<div class="formula">score(hi, s) = hi · s
α_i = softmax(scores)
context = Σ α_i × hi</div>
<p>Decoder attends to whichever encoder positions are most relevant. Dramatically improved translation (Bahdanau et al., 2014).</p>

<h2>9.3 Self-Attention</h2>
<p>Each position attends to all other positions in the same sequence. Captures dependencies regardless of distance.</p>
<ol>
<li>Project each input xi into Query, Key, Value:
  <div class="formula">Qi = Wq × xi,  Ki = Wk × xi,  Vi = Wv × xi</div></li>
<li>Score each pair: <code>score(i,j) = Qi · Kj / √dk</code> (scaling prevents large dot products → softmax saturation)</li>
<li>Attention weights: <code>α_ij = softmax(scores[i,:])</code></li>
<li>Output: <code>oi = Σj α_ij × Vj</code></li>
</ol>
<div class="formula">Attention(Q, K, V) = softmax(QKᵀ / √dk) × V</div>
<p><strong>Interpretation:</strong> Q = "what am I looking for", K = "what do I contain", V = "what I will contribute." High Q·K score = relevant match.</p>

<h2>9.4 Multi-Head Attention</h2>
<div class="formula">head_i = Attention(QWiq, KWik, VWiv)
MultiHead = Concat(head1,...,headh) × Wo</div>
<p>Different heads learn different attention patterns: syntax, coreference, topic, etc.</p>

<h1>10. The Transformer Architecture</h1>
<p>Vaswani et al., "Attention Is All You Need" (2017). No recurrence, no convolution — pure attention.</p>

<h2>10.1 Encoder Block (BERT-style)</h2>
<pre>Input → Embedding + Positional Encoding
     → [Multi-Head Self-Attention → Add &amp; Norm] × N
     → [Feed-Forward (2-layer MLP) → Add &amp; Norm] × N
     → Output representations</pre>

<h2>10.2 Decoder Block (GPT-style)</h2>
<pre>Input → Embedding + Positional Encoding
     → [Masked Self-Attention → Add &amp; Norm] × N   (causal mask)
     → [Cross-Attention → Add &amp; Norm] × N          (encoder-decoder only)
     → [Feed-Forward → Add &amp; Norm] × N
     → Linear → Softmax → Next token probabilities</pre>

<h2>10.3 Residual Connections ("Add &amp; Norm")</h2>
<div class="formula">output = LayerNorm(x + Sublayer(x))</div>
<p>Highway for gradients. Critical for training deep models (100+ layers). Without this, gradients can't flow back far enough.</p>

<h2>10.4 Positional Encoding</h2>
<p>Self-attention is order-invariant — treats input as a set. Position must be injected explicitly.</p>
<table>
<tr><th>Method</th><th>Formula / Idea</th><th>Used In</th></tr>
<tr><td>Sinusoidal</td><td>PE(pos,2i) = sin(pos / 10000<sup>2i/d</sup>)</td><td>Original Transformer</td></tr>
<tr><td>Learned absolute</td><td>Embedding table indexed by position</td><td>GPT-2, BERT</td></tr>
<tr><td>RoPE</td><td>Rotate Q and K in complex space by position angle</td><td>LLaMA, Mistral, Gemma</td></tr>
<tr><td>ALiBi</td><td>Linear penalty added to attention scores based on distance</td><td>Some LLaMA variants</td></tr>
</table>

<h2>10.5 Causal Masking</h2>
<p>LLM predicts next token — at position i, must not see tokens i+1, i+2... Apply mask: score(i,j) = -∞ if j &gt; i. After softmax, -∞ → 0 attention weight.</p>

<h2>10.6 Feed-Forward Network (FFN)</h2>
<div class="formula">FFN(x) = max(0, xW1 + b1)W2 + b2</div>
<p>Two linear layers with ReLU. Typically 4× wider than model dim (d=768 → FFN=3072). Attention routes/mixes information between positions. FFN stores factual knowledge and reasoning patterns.</p>
<p><strong>SwiGLU (LLaMA variant):</strong></p>
<div class="formula">FFN(x) = (SiLU(xW1) ⊙ xW2) W3</div>
<p>Gated FFN. Better than ReLU FFN empirically. Used in LLaMA 2/3, Mistral.</p>

<h1>11. Encoder vs Decoder vs Encoder-Decoder</h1>
<table>
<tr><th>Architecture</th><th>Examples</th><th>Use Case</th><th>Key Property</th></tr>
<tr><td>Encoder-only</td><td>BERT, RoBERTa</td><td>Classification, NER, semantic search</td><td>Bidirectional — sees full context both ways</td></tr>
<tr><td>Decoder-only</td><td>GPT, LLaMA, Mistral, Gemini</td><td>Chat, completion, generation</td><td>Causal/unidirectional</td></tr>
<tr><td>Encoder-Decoder</td><td>T5, BART, mT5</td><td>Translation, summarization, Q-generation</td><td>Full context encoding + autoregressive decoding</td></tr>
</table>
<p><strong>Why decoder-only dominates for LLMs:</strong> Simpler, scales better, emergent few-shot abilities, can do any task via prompting.</p>

<h1>12. Tokenization</h1>
<table>
<tr><th>Method</th><th>Unit</th><th>Pros</th><th>Cons</th></tr>
<tr><td>Word</td><td>Whole words</td><td>Human-readable tokens</td><td>OOV problem for rare words</td></tr>
<tr><td>Character</td><td>Single char</td><td>No OOV</td><td>Very long sequences, context wasted</td></tr>
<tr><td>BPE</td><td>Subword</td><td>Handles rare words, compact</td><td>Numbers tokenized badly</td></tr>
<tr><td>WordPiece</td><td>Subword</td><td>Likelihood-based merges</td><td>Same as BPE</td></tr>
<tr><td>SentencePiece</td><td>Byte-level subword</td><td>Language-agnostic (Devanagari etc.)</td><td>Slightly larger vocab</td></tr>
</table>
<p><strong>BPE (Byte Pair Encoding):</strong> start with characters, repeatedly merge most frequent adjacent pair into new token until vocab size reached (32k–128k). Used in GPT, LLaMA.</p>
<p><strong>Why tokenization matters:</strong> Context window = token limit. Numbers split weirdly → arithmetic hard. "dog" ≠ " dog" with leading space in many tokenizers.</p>

<h1>13. LLM Training</h1>

<h2>13.1 Data</h2>
<p>LLaMA 2: 2T tokens. GPT-4: estimated 10T+ tokens. Sources: Common Crawl, Wikipedia, books, code (GitHub), academic papers, StackExchange.</p>
<p><strong>Data quality pipeline:</strong> deduplication (MinHash) → language filtering → quality filtering (perplexity) → toxic/NSFW removal → PII removal.</p>

<h2>13.2 Pre-training Objective</h2>
<p><strong>CLM (Causal Language Modeling):</strong> predict next token. Self-supervised — no human labels needed.</p>
<div class="formula">Loss = -Σ_t log P(x_t | x_1,...,x_{t-1})</div>
<p>Given sequence ["The", "cat", "sat"], model predicts P("cat"|"The"), P("sat"|"The","cat"), etc. Backprop through cross-entropy → model learns grammar, facts, reasoning, style.</p>
<p><strong>MLM (BERT):</strong> mask 15% of tokens, predict masked tokens. Bidirectional. Can't do generation directly.</p>

<h2>13.3 Distributed Training</h2>
<table>
<tr><th>Strategy</th><th>How</th><th>When to Use</th></tr>
<tr><td>Data Parallelism</td><td>Copy model to N GPUs, each processes different batch, gradients averaged</td><td>Model fits on one GPU</td></tr>
<tr><td>Tensor Parallelism</td><td>Split weight matrices across GPUs within one layer</td><td>Very large models, fast interconnect</td></tr>
<tr><td>Pipeline Parallelism</td><td>Different layers on different GPUs</td><td>Too many layers for one GPU</td></tr>
<tr><td>ZeRO / FSDP</td><td>Shard optimizer states, gradients, params across GPUs</td><td>Largest models, memory bottleneck</td></tr>
</table>

<h2>13.4 Mixed Precision</h2>
<p>Train in BF16 (2 bytes/param, wide exponent range). Maintain FP32 master copy for precision. 2× memory reduction, 2-4× faster compute.</p>

<h1>14. Key Transformer Design Choices</h1>
<table>
<tr><th>Feature</th><th>GPT-2 (2019)</th><th>LLaMA 2 (2023)</th><th>LLaMA 3 (2024)</th></tr>
<tr><td>Attention</td><td>Multi-Head</td><td>Grouped Query (GQA)</td><td>Grouped Query (GQA)</td></tr>
<tr><td>FFN</td><td>ReLU</td><td>SwiGLU</td><td>SwiGLU</td></tr>
<tr><td>Normalization</td><td>Post-LayerNorm</td><td>RMSNorm (Pre-LN)</td><td>RMSNorm (Pre-LN)</td></tr>
<tr><td>Position</td><td>Learned absolute</td><td>RoPE</td><td>RoPE</td></tr>
<tr><td>Vocab size</td><td>50k</td><td>32k</td><td>128k</td></tr>
<tr><td>Context</td><td>1024</td><td>4096</td><td>8192</td></tr>
</table>

<h2>14.1 GQA (Grouped Query Attention)</h2>
<p>Multi-Head: N query heads, N key heads, N value heads. Multi-Query (MQA): N query, 1 shared KV — fast but quality loss. <strong>GQA:</strong> N query, G groups sharing KV (G &lt; N). Balance. LLaMA 2 70B: 64 Q heads, 8 KV heads.</p>
<p><strong>Why KV cache matters:</strong> At each generation step, KV for previous tokens is cached (reuse). For long sequences KV cache = GB of VRAM. GQA reduces this by N/G ratio.</p>

<h2>14.2 RMSNorm</h2>
<div class="formula">RMSNorm(x) = x / RMS(x) × γ,   RMS(x) = √(mean(x²))</div>
<p>Simpler than LayerNorm (no mean subtraction). ~7% faster. Applied before sublayer (Pre-LN) for training stability.</p>

<h1>15. Fine-Tuning</h1>

<h2>15.1 Full Fine-Tuning</h2>
<p>Update all parameters on task-specific data. Most powerful. Most expensive. Risk of catastrophic forgetting.</p>

<h2>15.2 LoRA (Low-Rank Adaptation)</h2>
<p><strong>Key insight:</strong> weight updates during fine-tuning are low-rank — most singular values near zero.</p>
<div class="formula">W' = W + ΔW = W + BA</div>
<p>Where B is (d×r) and A is (r×k) with rank r &lt;&lt; min(d,k). If W is 4096×4096 = 16.7M params and r=16: A+B = 130k params. ~128× reduction.</p>
<ul>
<li><strong>QLoRA:</strong> quantize base model to 4-bit (NF4), train LoRA adapters in BF16. Fine-tune 70B on single A100.</li>
<li><strong>DoRA:</strong> decompose W into magnitude + direction, apply LoRA to direction. Better quality.</li>
<li><strong>rsLoRA:</strong> scale LoRA by 1/√r. More stable.</li>
</ul>

<h2>15.3 Instruction Fine-Tuning (SFT)</h2>
<p>Train on (instruction, response) pairs. Transforms base model into instruction follower. Small high-quality data (1k–100k examples) sufficient.</p>
<pre>[INST] What is photosynthesis? [/INST]
Photosynthesis is the process by which plants...</pre>

<h1>16. RLHF — Reinforcement Learning from Human Feedback</h1>

<h2>16.1 Step 1: SFT</h2>
<p>Train base model on instruction data → SFT model.</p>

<h2>16.2 Step 2: Reward Model Training</h2>
<p>Collect comparison data: show human two responses, human picks preferred. Train Reward Model (RM) that assigns scalar score to (prompt, response) pairs.</p>
<div class="formula">L_RM = -log σ(r(x, yw) - r(x, yl))</div>
<p>yw = preferred response, yl = rejected. RM learns what humans prefer.</p>

<h2>16.3 Step 3: PPO Optimization</h2>
<p>Fine-tune SFT model (policy π) to maximize RM reward with KL divergence penalty:</p>
<div class="formula">objective = E[r(x, y)] - β × KL(π || π_SFT)</div>
<p>KL penalty prevents reward hacking and catastrophic forgetting of SFT.</p>
<p><strong>PPO (Proximal Policy Optimization):</strong></p>
<div class="formula">L_PPO = E[min(ratio × advantage, clip(ratio, 1-ε, 1+ε) × advantage)]
ratio = π(a|s) / π_old(a|s)</div>
<p>Clips ratio to [1-ε, 1+ε]. Prevents large destabilizing updates.</p>
<p><strong>PPO problems for LLMs:</strong> needs 4 models simultaneously (policy, reference, reward model, critic) — huge memory. Unstable. Slow.</p>

<h1>17. DPO — Direct Preference Optimization</h1>
<p>Stanford 2023. Eliminates reward model + PPO entirely.</p>
<div class="formula">L_DPO = -E[log σ(β × log(π(yw|x)/π_ref(yw|x)) - β × log(π(yl|x)/π_ref(yl|x)))]</div>
<p>Directly maximize probability of preferred over rejected response, relative to reference model. No separate RM. No PPO loop. Only 2 models (policy + reference). Stable, works with LoRA.</p>
<p><strong>Variants:</strong> IPO (avoids DPO failure modes), KTO (works on unpaired win/lose data), SimPO (reference-model free).</p>

<h1>18. GRPO — Group Relative Policy Optimization</h1>
<p>DeepSeek AI, 2024. Used in DeepSeek-R1. Alternative to PPO that eliminates the critic (value function).</p>

<h2>18.1 Core Idea</h2>
<p>For each question x, sample G outputs. Compute reward ri for each. Estimate baseline from group statistics:</p>
<div class="formula">Advantage_i = (r_i - mean(r)) / std(r)</div>
<p>Positive advantage → reinforce. Negative → suppress. No critic model needed.</p>

<h2>18.2 Loss</h2>
<div class="formula">L_GRPO = -E[Σ_i (min(ratio × A_i, clip(ratio, 1-ε, 1+ε) × A_i)) - β × KL]</div>

<h2>18.3 Why GRPO for Reasoning</h2>
<ul>
<li>Uses verifiable rewards (math: correct/incorrect — no learned RM needed)</li>
<li>Group comparison naturally captures relative quality of reasoning chains</li>
<li>No critic → 50% fewer model copies during training</li>
<li>Excellent for math, code, logic where rewards are objective</li>
</ul>

<h2>18.4 Outcome vs Process Reward</h2>
<table>
<tr><th>Type</th><th>Reward Signal</th><th>Data Requirement</th></tr>
<tr><td>ORM (Outcome)</td><td>Final answer correct/wrong</td><td>Easy — just check answer</td></tr>
<tr><td>PRM (Process)</td><td>Each reasoning step valid</td><td>Hard — need step-level labels</td></tr>
</table>
<p>DeepSeek-R1 uses both. PRM improves intermediate reasoning quality.</p>

<h1>19. Chain-of-Thought and Reasoning Models</h1>
<ul>
<li><strong>CoT (Chain-of-Thought):</strong> "think step by step" before answering. Huge accuracy gains on math/reasoning.</li>
<li><strong>Few-Shot CoT:</strong> show examples with step-by-step reasoning in prompt.</li>
<li><strong>Zero-Shot CoT:</strong> "Let's think step by step." Works at scale without examples.</li>
<li><strong>o1/R1 style:</strong> model trained to produce long CoT before final answer. RL signal only on correctness of final answer. Model learns to search, self-verify, backtrack. More thinking tokens → better answers (test-time compute scaling).</li>
</ul>

<h1>20. Quantization</h1>
<table>
<tr><th>Format</th><th>Bytes/param</th><th>70B Model Size</th><th>Quality</th></tr>
<tr><td>FP32</td><td>4</td><td>280 GB</td><td>Reference</td></tr>
<tr><td>BF16/FP16</td><td>2</td><td>140 GB</td><td>Near-lossless</td></tr>
<tr><td>INT8 (Q8)</td><td>1</td><td>70 GB</td><td>Nearly lossless</td></tr>
<tr><td>Q6_K</td><td>0.75</td><td>~52 GB</td><td>Excellent</td></tr>
<tr><td>Q4_K_M</td><td>0.5</td><td>~35 GB</td><td>Good balance (popular)</td></tr>
<tr><td>Q3_K_M</td><td>0.375</td><td>~26 GB</td><td>Visible quality loss</td></tr>
<tr><td>Q2_K</td><td>0.25</td><td>~18 GB</td><td>Significant degradation</td></tr>
</table>
<p><strong>GPTQ:</strong> uses inverse Hessian information to minimize quantization error. <strong>AWQ:</strong> activation-aware — preserves important weights (large activation magnitude). <strong>GGUF:</strong> single-file format with weights + tokenizer + architecture. Supports mixed quantization. Standard for local inference (llama.cpp).</p>

<h1>21. llama.cpp</h1>
<p>Georgi Gerganov, 2023. C/C++ inference engine. No Python, no CUDA required (though CUDA/Metal supported).</p>
<ul>
<li>Loads GGUF model file</li>
<li>CPU inference with AVX2/AVX512 SIMD</li>
<li>GPU offloading: N layers on GPU, rest on CPU</li>
<li>Flash attention, continuous batching</li>
<li>Metal backend (Apple Silicon), CUDA backend (NVIDIA)</li>
<li>Powers: Ollama, LM Studio, Jan</li>
</ul>
<p><strong>Inference loop:</strong></p>
<pre>For each token to generate:
  1. Load KV cache for all previous tokens
  2. Forward pass through N transformer layers
  3. Compute logits for vocabulary
  4. Sample next token (temperature, top-p, top-k)
  5. Append to KV cache
  6. Repeat until [EOS] or max_tokens</pre>

<h1>22. vLLM</h1>
<p>Woosuk Kwon et al., UC Berkeley, 2023. Production-grade LLM serving.</p>

<h2>22.1 PagedAttention (Core Innovation)</h2>
<p>KV cache stored in non-contiguous blocks (pages, ~16 tokens each). Physical blocks allocated on demand. Logical sequences mapped to physical blocks via block table. Near-zero KV cache waste (&lt;4% fragmentation). Can batch 20-40× more requests.</p>

<h2>22.2 Features</h2>
<ul>
<li><strong>Continuous batching:</strong> dynamically add new requests as old ones complete. Maximizes GPU utilization.</li>
<li><strong>Token streaming:</strong> send tokens to client as generated.</li>
<li><strong>Throughput:</strong> 2-24× higher than naive HuggingFace inference.</li>
<li><strong>Alternatives:</strong> TensorRT-LLM (NVIDIA, fastest, NVIDIA-only), TGI (HuggingFace)</li>
</ul>

<h1>23. Sampling Strategies</h1>
<table>
<tr><th>Strategy</th><th>How</th><th>Effect</th></tr>
<tr><td>Greedy</td><td>Always pick argmax</td><td>Deterministic, often repetitive</td></tr>
<tr><td>Temperature</td><td>softmax(logits / T). T&lt;1 sharpens, T&gt;1 flattens</td><td>Controls creativity/randomness</td></tr>
<tr><td>Top-K</td><td>Sample from top K tokens only</td><td>Eliminates very unlikely tokens</td></tr>
<tr><td>Top-P (nucleus)</td><td>Smallest set where cumulative prob ≥ p</td><td>Adaptive — tight when model confident</td></tr>
<tr><td>Min-P</td><td>Keep tokens with prob ≥ min_p × max_token_prob</td><td>Relative threshold, clean outputs</td></tr>
<tr><td>Repetition penalty</td><td>Divide logit of recent tokens by penalty&gt;1</td><td>Reduces loops and repetition</td></tr>
</table>
<p>Common default: temperature=0.7, top_p=0.9.</p>

<h1>24. Context Window and KV Cache</h1>
<p><strong>Context window:</strong> max tokens processable at once. GPT-4: 128k. LLaMA 3: 8k base, 128k extended.</p>
<p><strong>KV cache size formula:</strong></p>
<div class="formula">2 × n_layers × n_kv_heads × head_dim × seq_len × bytes_per_param</div>
<p>LLaMA 3 70B at 8k context in BF16: ~26 GB per request.</p>
<p><strong>Context extension methods:</strong> YaRN (rescale RoPE frequencies), ALiBi (natural extrapolation), Sliding window attention (Mistral — O(W) memory instead of O(n²)).</p>

<h1>25. Flash Attention</h1>
<p>Naive attention: QKᵀ matrix = n×n. 8k context → 256MB per head per layer. Bandwidth bottleneck.</p>
<p><strong>FlashAttention (Dao et al., 2022):</strong> compute attention in tiles without materializing full n×n matrix. Fuse softmax + matmul into single GPU kernel. O(n) memory, 2-4× speedup.</p>
<ul>
<li><strong>FA-2:</strong> better parallelization, native GQA. 2× faster than FA-1.</li>
<li><strong>FA-3:</strong> H100-specific, async ops, FP8, ~75% H100 utilization.</li>
</ul>

<h1>26. Model Architectures Timeline</h1>
<table>
<tr><th>Year</th><th>Model</th><th>Org</th><th>Params</th><th>Key Contribution</th></tr>
<tr><td>2017</td><td>Transformer</td><td>Google</td><td>—</td><td>Self-attention replaces RNN</td></tr>
<tr><td>2018</td><td>BERT</td><td>Google</td><td>340M</td><td>Bidirectional encoder, MLM pretraining</td></tr>
<tr><td>2019</td><td>GPT-2</td><td>OpenAI</td><td>1.5B</td><td>Decoder-only, CLM at scale</td></tr>
<tr><td>2020</td><td>GPT-3</td><td>OpenAI</td><td>175B</td><td>Few-shot emergent abilities</td></tr>
<tr><td>2022</td><td>ChatGPT</td><td>OpenAI</td><td>~175B</td><td>SFT + RLHF alignment</td></tr>
<tr><td>2023</td><td>LLaMA</td><td>Meta</td><td>7-65B</td><td>Open weights, efficient</td></tr>
<tr><td>2023</td><td>Mistral 7B</td><td>Mistral</td><td>7B</td><td>GQA + sliding window, beats LLaMA 13B</td></tr>
<tr><td>2023</td><td>LLaMA 2</td><td>Meta</td><td>7-70B</td><td>RLHF aligned, 4k context</td></tr>
<tr><td>2024</td><td>Mixtral 8×7B</td><td>Mistral</td><td>47B total, 13B active</td><td>Mixture of Experts</td></tr>
<tr><td>2024</td><td>LLaMA 3</td><td>Meta</td><td>8-70B</td><td>128k vocab, strong instruct</td></tr>
<tr><td>2024</td><td>Gemma 2</td><td>Google</td><td>2-27B</td><td>GQA + logit softcapping</td></tr>
<tr><td>2024</td><td>DeepSeek-R1</td><td>DeepSeek</td><td>671B MoE</td><td>GRPO-trained reasoning</td></tr>
</table>

<h1>27. Mixture of Experts (MoE)</h1>
<p>Dense model: every token uses every parameter. MoE: N expert FFN layers, router selects top-K experts per token.</p>
<div class="formula">output = Σ_{i∈TopK} router_weight(i) × Expert_i(x)</div>
<p><strong>Why:</strong> same parameter count → higher capacity. Same compute per token → faster inference than equivalent dense model.</p>
<ul>
<li><strong>Mixtral 8×7B:</strong> 8 experts, 2 active. Total ~47B, active ~13B. Performs like 34B dense.</li>
<li><strong>DeepSeek-R1:</strong> 671B total, ~37B active. 256 experts, top-8.</li>
<li><strong>Challenges:</strong> load balancing (auxiliary loss), expert routing overhead, communication across GPUs.</li>
</ul>

<h1>28. LLM Capabilities and Limitations</h1>
<table>
<tr><th>Capability</th><th>How</th></tr>
<tr><td>In-context learning</td><td>Few examples in prompt → model adapts without weight update</td></tr>
<tr><td>Zero-shot generalization</td><td>Instruction in prompt, model follows</td></tr>
<tr><td>Tool use / Function calling</td><td>Generate structured JSON, API routes to actual tools</td></tr>
<tr><td>RAG</td><td>Retrieve external text, inject into context</td></tr>
<tr><td>Code execution</td><td>Generate code → execute → feed result back</td></tr>
<tr><td>Agents</td><td>LLM as reasoning core, calls tools, observes, loops</td></tr>
<tr><td>Structured output</td><td>Constrained decoding (grammar-based) → always valid JSON</td></tr>
</table>
<p><strong>Limitations:</strong> arithmetic (poor number tokenization), real-time info (training cutoff), persistent memory (context window only), hallucination (confident but wrong).</p>
<p><strong>Mitigations:</strong> code interpreter for math, RAG for knowledge, vector DB for memory, verifiers for correctness.</p>

<p style="page-break-after:always;"></p>

<!-- ═══════════════════════════ PART II: DBMS ═══════════════════════════ -->
<div class="part-title">PART II: Database Management Systems (DBMS)</div>

<h1>1. What is a Database?</h1>

<h2>1.1 Why Not File Systems?</h2>
<ul>
<li>Data redundancy (same data in multiple files)</li>
<li>Inconsistency (update one file, forget another)</li>
<li>No concurrent access control</li>
<li>No security, backup, or querying</li>
</ul>
<p><strong>DBMS</strong> = software managing structured data. Handles storage, retrieval, concurrency, integrity, security.</p>
<p><strong>RDBMS</strong> = Relational DBMS. Data stored in tables (relations) linked via keys. Examples: PostgreSQL, MySQL, Oracle, SQLite, SQL Server.</p>

<h2>1.2 Key Terminology</h2>
<table>
<tr><th>Term</th><th>Meaning</th></tr>
<tr><td>Table (Relation)</td><td>Grid of rows and columns</td></tr>
<tr><td>Tuple (Row)</td><td>One data entry: (1, "Adith", "Class 10")</td></tr>
<tr><td>Attribute (Column)</td><td>One field: student_id, name, class</td></tr>
<tr><td>Domain</td><td>Allowed values for attribute. age: positive integers</td></tr>
<tr><td>Degree</td><td>Number of attributes (columns)</td></tr>
<tr><td>Cardinality</td><td>Number of tuples (rows)</td></tr>
<tr><td>Schema</td><td>Structure definition — blueprint. What tables, columns, types, constraints exist.</td></tr>
<tr><td>Instance</td><td>Actual data in DB at a point in time</td></tr>
</table>

<h1>2. Keys</h1>
<table>
<tr><th>Key Type</th><th>Definition</th><th>Notes</th></tr>
<tr><td>Super Key</td><td>Any set of attributes uniquely identifying a tuple</td><td>{student_id}, {student_id, name}, {email} — all super keys if unique</td></tr>
<tr><td>Candidate Key</td><td>Minimal super key — no subset is also a super key</td><td>Can't remove any attribute and retain uniqueness</td></tr>
<tr><td>Primary Key (PK)</td><td>Chosen candidate key</td><td>NOT NULL, UNIQUE, physically indexed</td></tr>
<tr><td>Alternate Key</td><td>Candidate keys not chosen as PK</td><td>—</td></tr>
<tr><td>Foreign Key (FK)</td><td>References PK of another table</td><td>Enforces referential integrity</td></tr>
<tr><td>Composite Key</td><td>Key made of multiple attributes</td><td>(order_id, product_id) unique together</td></tr>
<tr><td>Surrogate Key</td><td>Artificial PK, no business meaning</td><td>Auto-increment integer. Preferred over natural keys.</td></tr>
<tr><td>Natural Key</td><td>PK with real-world meaning</td><td>Risky — real-world data changes</td></tr>
</table>

<h1>3. Relational Algebra</h1>
<table>
<tr><th>Operator</th><th>Symbol</th><th>Meaning</th></tr>
<tr><td>Select</td><td>σ</td><td>Filter rows: σ(age&gt;18)(Students)</td></tr>
<tr><td>Project</td><td>π</td><td>Pick columns: π(name, age)(Students)</td></tr>
<tr><td>Union</td><td>∪</td><td>All rows from both tables (same schema)</td></tr>
<tr><td>Intersection</td><td>∩</td><td>Rows in both tables</td></tr>
<tr><td>Difference</td><td>−</td><td>Rows in first not in second</td></tr>
<tr><td>Cartesian Product</td><td>×</td><td>Every pair from both tables</td></tr>
<tr><td>Natural Join</td><td>⋈</td><td>Join on all common attributes</td></tr>
<tr><td>Rename</td><td>ρ</td><td>Rename table/attributes</td></tr>
</table>
<p><strong>Outer Joins:</strong> LEFT (all left + matching right, NULLs for non-matches), RIGHT (opposite), FULL (all from both, NULLs where no match).</p>

<h1>4. SQL — Complete Reference</h1>

<h2>4.1 DDL (Data Definition Language)</h2>
<pre>CREATE TABLE students (
    student_id  SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(255) UNIQUE,
    class_level INT CHECK (class_level IN (10, 12)),
    school_id   INT REFERENCES schools(id) ON DELETE CASCADE,
    created_at  TIMESTAMP DEFAULT NOW()
);

ALTER TABLE students ADD COLUMN phone VARCHAR(15);
ALTER TABLE students DROP COLUMN phone;
DROP TABLE students;          -- delete table
TRUNCATE TABLE students;      -- delete all rows, keep structure</pre>

<h2>4.2 DML (Data Manipulation Language)</h2>
<pre>-- Insert
INSERT INTO students (name, email, class_level) VALUES ('Adith', 'a@b.com', 10);

-- Update
UPDATE students SET class_level = 12 WHERE student_id = 5;

-- Delete
DELETE FROM students WHERE student_id = 5;

-- Select
SELECT name, email FROM students WHERE class_level = 10 ORDER BY name ASC LIMIT 10;</pre>

<h2>4.3 Advanced Queries</h2>
<pre>-- Joins
SELECT s.name, sc.school_name
FROM students s
INNER JOIN schools sc ON s.school_id = sc.id;

SELECT s.name, sc.school_name
FROM students s
LEFT JOIN schools sc ON s.school_id = sc.id;  -- includes unassigned students

-- Aggregates + GROUP BY + HAVING
SELECT class_level, COUNT(*), AVG(score), MAX(score)
FROM students
GROUP BY class_level
HAVING COUNT(*) &gt; 50;  -- HAVING filters AFTER GROUP BY; WHERE filters BEFORE

-- Subquery
SELECT name FROM students
WHERE school_id IN (SELECT id FROM schools WHERE city = 'Mumbai');

-- Window functions
SELECT name, score,
    RANK() OVER (PARTITION BY class_level ORDER BY score DESC) as rank,
    LAG(score) OVER (ORDER BY created_at) as prev_score
FROM students;

-- CTE (Common Table Expression)
WITH top_students AS (
    SELECT * FROM students WHERE score &gt; 90
)
SELECT school_id, AVG(score) FROM top_students GROUP BY school_id;</pre>

<h2>4.4 Transactions (TCL)</h2>
<pre>BEGIN;
UPDATE accounts SET balance = balance - 500 WHERE id = 1;
UPDATE accounts SET balance = balance + 500 WHERE id = 2;
COMMIT;    -- make permanent
-- OR
ROLLBACK;  -- undo everything since BEGIN

SAVEPOINT sp1;
ROLLBACK TO sp1;</pre>

<h1>5. ACID Properties</h1>
<table>
<tr><th>Property</th><th>Meaning</th><th>Example</th></tr>
<tr><td><strong>Atomicity</strong></td><td>All or nothing</td><td>Transfer debits A, credits B — either both happen or neither</td></tr>
<tr><td><strong>Consistency</strong></td><td>DB moves between valid states</td><td>Constraints always satisfied before and after transaction</td></tr>
<tr><td><strong>Isolation</strong></td><td>Concurrent transactions don't interfere</td><td>Each sees consistent snapshot as if running serially</td></tr>
<tr><td><strong>Durability</strong></td><td>Committed data persists after crash</td><td>Written to disk via WAL (Write-Ahead Log)</td></tr>
</table>

<h2>5.1 Isolation Levels and Read Problems</h2>
<table>
<tr><th>Problem</th><th>Description</th></tr>
<tr><td>Dirty Read</td><td>Read uncommitted data from another transaction that may rollback</td></tr>
<tr><td>Non-Repeatable Read</td><td>Same row read twice gives different values (another committed update between reads)</td></tr>
<tr><td>Phantom Read</td><td>Re-execute query gets different rows (another transaction inserted/deleted)</td></tr>
</table>
<table>
<tr><th>Isolation Level</th><th>Dirty Read</th><th>Non-Repeatable</th><th>Phantom</th></tr>
<tr><td>READ UNCOMMITTED</td><td>Possible</td><td>Possible</td><td>Possible</td></tr>
<tr><td>READ COMMITTED</td><td>Prevented</td><td>Possible</td><td>Possible</td></tr>
<tr><td>REPEATABLE READ</td><td>Prevented</td><td>Prevented</td><td>Possible</td></tr>
<tr><td>SERIALIZABLE</td><td>Prevented</td><td>Prevented</td><td>Prevented</td></tr>
</table>
<p>PostgreSQL default: READ COMMITTED. MySQL InnoDB: REPEATABLE READ. Higher isolation = more locking = less concurrency.</p>

<h2>5.2 Concurrency Control</h2>
<p><strong>2PL (Two-Phase Locking):</strong> Phase 1 (Growing) acquire locks only. Phase 2 (Shrinking) release locks only. Guarantees serializability but can deadlock.</p>
<p><strong>MVCC (Multi-Version Concurrency Control):</strong> readers never block writers, writers never block readers. Each transaction sees DB snapshot at start time. PostgreSQL uses this. Much better concurrency.</p>
<p><strong>Deadlock:</strong> T1 holds A waits for B, T2 holds B waits for A. DBMS detects cycle → kills one transaction.</p>

<h1>6. Normalization — Complete Guide</h1>

<h2>6.1 Functional Dependency (FD)</h2>
<p>X → Y means knowing X uniquely determines Y. If two rows have same X, they must have same Y.</p>
<div class="formula">student_id → name    ✓ (each ID has one name)
name → student_id    ✗ (multiple students can share a name)</div>
<p><strong>Closure of X (X+):</strong> all attributes determinable from X. If X+ = all attributes, X is a super key.</p>

<h2>6.2 First Normal Form (1NF)</h2>
<p><strong>Rule:</strong> every cell contains atomic (indivisible) value. No multi-valued attributes. No repeating groups.</p>
<p><strong>Violation:</strong></p>
<pre>student_id | subjects
1          | "Math, Science, English"   &lt;-- not atomic</pre>
<p><strong>Fix:</strong> one row per subject, or separate junction table.</p>

<h2>6.3 Second Normal Form (2NF)</h2>
<p><strong>Rule:</strong> in 1NF AND no partial dependency — every non-key attribute depends on the WHOLE primary key, not part of it. Only relevant for composite PKs.</p>
<p><strong>Violation:</strong></p>
<pre>Table: Enrollment(student_id, subject_id, grade, student_name, subject_name)
PK = (student_id, subject_id)

student_name → depends on student_id alone  ✗ PARTIAL DEPENDENCY
subject_name → depends on subject_id alone  ✗ PARTIAL DEPENDENCY</pre>
<p><strong>Fix:</strong> split into Student(student_id, student_name), Subject(subject_id, subject_name), Enrollment(student_id, subject_id, grade).</p>

<h2>6.4 Third Normal Form (3NF)</h2>
<p><strong>Rule:</strong> in 2NF AND no transitive dependency — non-key attribute must not depend on another non-key attribute.</p>
<p><strong>Violation:</strong></p>
<pre>Student(student_id, name, zip_code, city, state)
zip_code → city   ✗ TRANSITIVE (city depends on zip, not directly on student_id)
zip_code → state  ✗ TRANSITIVE</pre>
<p><strong>Fix:</strong> Student(student_id, name, zip_code) + ZipCode(zip_code, city, state).</p>
<p><strong>Formal 3NF definition:</strong> for every FD X→Y, either X is a super key OR Y is a prime attribute (part of some candidate key).</p>

<h2>6.5 Boyce-Codd Normal Form (BCNF)</h2>
<p><strong>Rule:</strong> for every non-trivial FD X→Y, X must be a super key. No exceptions (stricter than 3NF).</p>
<p><strong>Violation:</strong></p>
<pre>CourseTeacher(student, course, teacher)
FDs: (student, course) → teacher   [PK]
     teacher → course               [teacher teaches one course]
teacher is NOT a super key → BCNF violated!</pre>
<p><strong>Fix:</strong> TeacherCourse(teacher, course) + StudentTeacher(student, teacher).</p>
<p><strong>BCNF vs 3NF tradeoff:</strong> BCNF eliminates all redundancy but may not preserve all FDs. 3NF always preserves FDs. In practice: aim for BCNF, accept 3NF when BCNF causes FD loss.</p>

<h2>6.6 Fourth Normal Form (4NF)</h2>
<p><strong>Multi-valued dependency (MVD):</strong> X →→ Y means for each X, set of Y values is independent of other attributes.</p>
<p><strong>Violation:</strong></p>
<pre>Employee(emp_id, skill, language)
emp_id →→ skill     (multiple skills, independent of language)
emp_id →→ language  (multiple languages, independent of skill)
Result: every skill × language pair row — massive redundancy!</pre>
<p><strong>Fix:</strong> EmployeeSkill(emp_id, skill) + EmployeeLanguage(emp_id, language).</p>

<h2>6.7 Normalization Quick Reference</h2>
<table>
<tr><th>Normal Form</th><th>Eliminates</th><th>Requires</th></tr>
<tr><td>1NF</td><td>Multi-valued / non-atomic attributes</td><td>Atomic values, PK</td></tr>
<tr><td>2NF</td><td>Partial dependencies (on part of composite PK)</td><td>1NF</td></tr>
<tr><td>3NF</td><td>Transitive dependencies (non-key → non-key)</td><td>2NF</td></tr>
<tr><td>BCNF</td><td>All FD anomalies (stricter 3NF)</td><td>3NF, accept FD loss</td></tr>
<tr><td>4NF</td><td>Multi-valued dependencies</td><td>BCNF</td></tr>
<tr><td>5NF</td><td>Join dependencies</td><td>4NF (rarely needed)</td></tr>
</table>

<h1>7. ER Diagrams</h1>
<table>
<tr><th>Symbol</th><th>Meaning</th></tr>
<tr><td>Rectangle</td><td>Entity (Student, School, Subject)</td></tr>
<tr><td>Oval</td><td>Attribute. Double oval = multi-valued. Dashed = derived.</td></tr>
<tr><td>Diamond</td><td>Relationship (Enrolls, Teaches)</td></tr>
<tr><td>Double rectangle</td><td>Weak entity (depends on another entity)</td></tr>
<tr><td>Single line</td><td>1:1 relationship</td></tr>
<tr><td>Arrow on one side</td><td>1:N relationship</td></tr>
<tr><td>Arrows both sides</td><td>M:N relationship → junction table</td></tr>
</table>

<h1>8. Indexing</h1>
<p>Without index: full table scan = O(n). 10M rows → scan every row.</p>

<table>
<tr><th>Index Type</th><th>Structure</th><th>Good For</th><th>Bad For</th></tr>
<tr><td>B+ Tree</td><td>Balanced tree, linked leaf nodes</td><td>Equality, range, ORDER BY — O(log n)</td><td>High-cardinality write-heavy</td></tr>
<tr><td>Hash</td><td>Hash function → bucket</td><td>Equality only — O(1)</td><td>Range queries (useless)</td></tr>
<tr><td>Composite</td><td>Multi-column B+ tree</td><td>Left-prefix queries</td><td>Queries on non-leftmost column only</td></tr>
<tr><td>Covering</td><td>Index contains all needed columns</td><td>Query served from index only</td><td>Wide indexes increase write overhead</td></tr>
</table>
<p><strong>When NOT to index:</strong> columns rarely queried, very low selectivity (e.g. boolean flags), small tables, write-heavy tables.</p>
<p><strong>EXPLAIN ANALYZE:</strong> shows query execution plan. Look for Seq Scan (bad on large tables) vs Index Scan (good).</p>

<h1>9. Transactions — Deeper</h1>
<pre>-- Idempotency pattern
INSERT INTO students (student_id, name)
VALUES (1, 'Adith')
ON CONFLICT (student_id) DO UPDATE SET name = EXCLUDED.name;

-- Advisory lock (application-level)
SELECT pg_advisory_lock(12345);  -- acquire
SELECT pg_advisory_unlock(12345);  -- release</pre>

<h1>10. NoSQL — When and Why</h1>
<table>
<tr><th>Type</th><th>Examples</th><th>Data Model</th><th>Use Case</th></tr>
<tr><td>Document</td><td>MongoDB, Firestore</td><td>JSON documents</td><td>Flexible schema, nested data</td></tr>
<tr><td>Key-Value</td><td>Redis, DynamoDB</td><td>Hash map</td><td>Sessions, caching, leaderboards</td></tr>
<tr><td>Wide-column</td><td>Cassandra, HBase</td><td>Dynamic columns per row</td><td>Time-series, IoT, high write throughput</td></tr>
<tr><td>Graph</td><td>Neo4j</td><td>Nodes + edges</td><td>Social networks, recommendations</td></tr>
</table>
<p><strong>CAP Theorem:</strong> Consistency, Availability, Partition tolerance — can guarantee at most 2 of 3 simultaneously. NoSQL often chooses Availability + Partition tolerance, giving up strong consistency (BASE: Basically Available, Soft state, Eventually consistent).</p>

<p style="page-break-after:always;"></p>

<!-- ═══════════════════════════ PART III: NETWORKS ═══════════════════════════ -->
<div class="part-title">PART III: Computer Networks</div>

<h1>1. Network Fundamentals</h1>

<h2>1.1 Network Types by Geography</h2>
<table>
<tr><th>Type</th><th>Scale</th><th>Examples</th></tr>
<tr><td>PAN</td><td>~10m</td><td>Bluetooth devices</td></tr>
<tr><td>LAN</td><td>Building/campus</td><td>Ethernet, WiFi</td></tr>
<tr><td>MAN</td><td>City</td><td>Cable TV, metro fiber</td></tr>
<tr><td>WAN</td><td>Countries/continents</td><td>Internet, leased lines</td></tr>
</table>

<h2>1.2 Network Topologies</h2>
<table>
<tr><th>Topology</th><th>Description</th><th>Failure Mode</th></tr>
<tr><td>Bus</td><td>All on single cable</td><td>One break = whole network down</td></tr>
<tr><td>Star</td><td>All connect to central switch</td><td>Switch failure = total failure</td></tr>
<tr><td>Ring</td><td>Devices in loop</td><td>Used in legacy Token Ring</td></tr>
<tr><td>Mesh</td><td>Every device connected to every other</td><td>Very fault tolerant, expensive</td></tr>
<tr><td>Tree</td><td>Hierarchical buses</td><td>Used in corporate networks</td></tr>
</table>

<h1>2. The OSI Model — All 7 Layers</h1>
<p><strong>Mnemonic (top to bottom):</strong> "All People Seem To Need Data Processing"</p>
<p>Application, Presentation, Session, Transport, Network, Data Link, Physical</p>

<table>
<tr><th>#</th><th>Layer</th><th>PDU</th><th>Protocols / Devices</th><th>Key Function</th></tr>
<tr><td>7</td><td>Application</td><td>Message</td><td>HTTP, DNS, FTP, SMTP, SSH, DHCP, SNMP</td><td>User-facing services</td></tr>
<tr><td>6</td><td>Presentation</td><td>Data</td><td>SSL/TLS, JPEG, ASCII, MPEG</td><td>Format, encrypt, compress</td></tr>
<tr><td>5</td><td>Session</td><td>Data</td><td>RPC, NetBIOS, SIP, PPTP</td><td>Session establish/manage/terminate</td></tr>
<tr><td>4</td><td>Transport</td><td>Segment/Datagram</td><td>TCP, UDP</td><td>End-to-end delivery, ports</td></tr>
<tr><td>3</td><td>Network</td><td>Packet</td><td>IP, ICMP, OSPF, BGP, RIP</td><td>Routing, logical addressing</td></tr>
<tr><td>2</td><td>Data Link</td><td>Frame</td><td>Ethernet, WiFi (802.11), ARP</td><td>MAC addressing, framing, same-LAN</td></tr>
<tr><td>1</td><td>Physical</td><td>Bit</td><td>Copper, Fiber, Radio, Hub, Repeater</td><td>Raw bits on medium</td></tr>
</table>

<h2>2.1 Layer 7 — Application</h2>
<p>Interface between network and user application. Defines protocols apps use.</p>
<table>
<tr><th>Protocol</th><th>Port</th><th>Purpose</th></tr>
<tr><td>HTTP</td><td>80 TCP</td><td>Web browsing (unencrypted)</td></tr>
<tr><td>HTTPS</td><td>443 TCP</td><td>Web browsing (TLS encrypted)</td></tr>
<tr><td>FTP</td><td>20/21 TCP</td><td>File transfer</td></tr>
<tr><td>SSH</td><td>22 TCP</td><td>Secure remote shell</td></tr>
<tr><td>SMTP</td><td>25, 587 TCP</td><td>Send email</td></tr>
<tr><td>IMAP</td><td>143, 993 TCP</td><td>Receive email (sync)</td></tr>
<tr><td>POP3</td><td>110, 995 TCP</td><td>Receive email (download+delete)</td></tr>
<tr><td>DNS</td><td>53 UDP/TCP</td><td>Domain name resolution</td></tr>
<tr><td>DHCP</td><td>67/68 UDP</td><td>Auto-assign IP addresses</td></tr>
<tr><td>SNMP</td><td>161/162 UDP</td><td>Network device management</td></tr>
<tr><td>NTP</td><td>123 UDP</td><td>Time synchronization</td></tr>
</table>

<h2>2.2 Layer 6 — Presentation</h2>
<p>Translation, encryption, compression between application data and network format.</p>
<ul>
<li><strong>Translation:</strong> UTF-8 ↔ UTF-16, ASCII ↔ EBCDIC</li>
<li><strong>Encryption:</strong> SSL/TLS (though modern TLS spans L5/L6/L7)</li>
<li><strong>Compression:</strong> JPEG, MPEG, GIF</li>
</ul>

<h2>2.3 Layer 5 — Session</h2>
<p>Establishes, manages, terminates sessions between applications.</p>
<ul>
<li><strong>Session establishment:</strong> authenticate, authorize, open session</li>
<li><strong>Checkpointing:</strong> resume large file transfer after network drop — no full restart needed</li>
<li><strong>Protocols:</strong> RPC (Remote Procedure Call), NetBIOS, SIP (VoIP setup/teardown), PPTP (VPN)</li>
</ul>

<h2>2.4 Layer 4 — Transport</h2>

<h3>TCP (Transmission Control Protocol)</h3>
<ul>
<li>Connection-oriented — 3-way handshake</li>
<li>Reliable — guaranteed delivery, ordered, no duplicates</li>
<li>Flow control — receiver controls send rate (sliding window)</li>
<li>Congestion control — slows down when network congested</li>
</ul>
<p><strong>3-way handshake:</strong></p>
<pre>Client → Server: SYN  (seq=x)
Server → Client: SYN-ACK  (seq=y, ack=x+1)
Client → Server: ACK  (ack=y+1)
Connection established.</pre>
<p><strong>4-way termination:</strong></p>
<pre>Client → Server: FIN
Server → Client: ACK
Server → Client: FIN
Client → Server: ACK
Client waits TIME_WAIT (2×MSL)</pre>
<p><strong>TCP Congestion Control:</strong></p>
<ul>
<li>Slow start: cwnd=1 MSS, double every RTT until threshold</li>
<li>Congestion avoidance: increase 1 MSS per RTT after threshold</li>
<li>Loss detected: threshold = cwnd/2, restart slow start</li>
</ul>

<h3>UDP (User Datagram Protocol)</h3>
<ul>
<li>Connectionless — no handshake, just send</li>
<li>Unreliable — no guarantee of delivery, order, deduplication</li>
<li>Fast — 8-byte header vs TCP's 20 bytes</li>
<li>Use cases: DNS, video/audio streaming, gaming, DHCP, NTP, QUIC/HTTP3</li>
</ul>

<h2>2.5 Layer 3 — Network</h2>
<p>Logical addressing (IP) and routing across networks.</p>
<ul>
<li><strong>IP:</strong> connectionless, best effort delivery</li>
<li><strong>ICMP:</strong> error reporting. ping = ICMP Echo. traceroute = ICMP TTL exceeded.</li>
<li><strong>ARP:</strong> maps IP → MAC address within same network</li>
<li><strong>TTL:</strong> decremented at each router, packet dropped at TTL=0 (prevents infinite loops)</li>
</ul>
<p><strong>Routing Protocols:</strong></p>
<table>
<tr><th>Protocol</th><th>Type</th><th>Metric</th><th>Used In</th></tr>
<tr><td>RIP</td><td>Distance-vector</td><td>Hop count (max 15)</td><td>Small networks (legacy)</td></tr>
<tr><td>OSPF</td><td>Link-state (Dijkstra)</td><td>Cost (bandwidth)</td><td>Enterprise LANs</td></tr>
<tr><td>BGP</td><td>Path-vector</td><td>Policy-based</td><td>Internet backbone between ISPs</td></tr>
</table>

<h2>2.6 Layer 2 — Data Link</h2>
<p>Node-to-node transfer on same network segment. MAC addressing, framing, error detection.</p>
<p><strong>MAC Address:</strong> 48-bit hardware address. AA:BB:CC:DD:EE:FF. First 3 bytes = OUI (manufacturer). Unique per NIC.</p>
<p><strong>Error detection methods:</strong></p>
<ul>
<li>Parity bit — detects odd number of bit errors</li>
<li>CRC (Cyclic Redundancy Check) — polynomial division, very reliable detection. Standard in Ethernet.</li>
<li>Checksum — used in IP/TCP/UDP headers</li>
</ul>
<p><strong>MAC Access Protocols:</strong></p>
<table>
<tr><th>Protocol</th><th>Used In</th><th>How</th></tr>
<tr><td>CSMA/CD</td><td>Wired Ethernet</td><td>Sense → Transmit → Detect collision → Jam + backoff</td></tr>
<tr><td>CSMA/CA</td><td>WiFi (802.11)</td><td>Sense → Wait DIFS → Random backoff → Transmit → Wait ACK</td></tr>
</table>
<p><strong>ARP process:</strong></p>
<ol>
<li>Device knows target IP but not MAC</li>
<li>Broadcast: "Who has IP 192.168.1.5?"</li>
<li>Target replies with its MAC</li>
<li>Requester caches in ARP table</li>
</ol>
<p><strong>ARP Poisoning:</strong> attacker sends fake ARP replies → traffic redirected through attacker (MITM attack).</p>

<h2>2.7 Layer 1 — Physical</h2>
<p>Raw bit transmission. Electrical signals, light pulses, radio waves.</p>
<table>
<tr><th>Medium</th><th>Type</th><th>Speed / Range</th><th>Use</th></tr>
<tr><td>Twisted Pair UTP Cat5e</td><td>Guided copper</td><td>100 Mbps</td><td>Ethernet LAN</td></tr>
<tr><td>Twisted Pair UTP Cat6</td><td>Guided copper</td><td>1 Gbps</td><td>Ethernet LAN</td></tr>
<tr><td>Cat6a</td><td>Guided copper</td><td>10 Gbps</td><td>High-speed LAN</td></tr>
<tr><td>Coaxial</td><td>Guided copper</td><td>—</td><td>Cable TV, early Ethernet</td></tr>
<tr><td>Single-mode fiber</td><td>Guided light</td><td>Terabits, km range</td><td>WAN backbone</td></tr>
<tr><td>Multi-mode fiber</td><td>Guided light</td><td>High, 100s meters</td><td>Data centers</td></tr>
<tr><td>WiFi 2.4GHz</td><td>Unguided radio</td><td>Up to 600 Mbps (n)</td><td>Long range, more interference</td></tr>
<tr><td>WiFi 5GHz</td><td>Unguided radio</td><td>Up to 3.5 Gbps (ac)</td><td>Short range, less interference</td></tr>
</table>
<p><strong>Shannon's Capacity:</strong></p>
<div class="formula">C = B × log₂(1 + S/N)</div>
<p>C = max capacity, B = bandwidth (Hz), S/N = signal-to-noise ratio. Physical limit — no encoding can exceed this.</p>

<h2>2.8 Encapsulation</h2>
<p>Data travels down layers; each layer adds its header. Going up on receiver: each layer strips its header.</p>
<pre>App data
 → [L4 header | App data]                         (segment)
 → [L3 header | L4 header | data]                 (packet)
 → [L2 header | L3 hdr | L4 hdr | data | L2 FCS]  (frame)
 → bits on wire</pre>

<h1>3. TCP/IP Model vs OSI</h1>
<table>
<tr><th>TCP/IP Layer</th><th>OSI Equivalent</th></tr>
<tr><td>Application</td><td>Application + Presentation + Session (L7+L6+L5)</td></tr>
<tr><td>Transport</td><td>Transport (L4)</td></tr>
<tr><td>Internet</td><td>Network (L3)</td></tr>
<tr><td>Network Access</td><td>Data Link + Physical (L2+L1)</td></tr>
</table>

<h1>4. IPv4 Addressing</h1>
<p>32-bit address. Written as 4 octets in dotted decimal. Total: 2<sup>32</sup> = ~4.3 billion addresses.</p>
<div class="formula">192.168.10.25 = 11000000.10101000.00001010.00011001</div>
<p>IP address = Network ID + Host ID. Subnet mask defines the boundary.</p>

<h1>5. IP Address Classes</h1>
<table>
<tr><th>Class</th><th>Range</th><th>Default Mask</th><th>Networks</th><th>Hosts/Network</th><th>Use</th></tr>
<tr><td><strong>A</strong></td><td>1.0.0.0 – 126.255.255.255</td><td>255.0.0.0 (/8)</td><td>126</td><td>16,777,214</td><td>Large orgs, ISPs. Private: 10.x.x.x</td></tr>
<tr><td><strong>B</strong></td><td>128.0.0.0 – 191.255.255.255</td><td>255.255.0.0 (/16)</td><td>16,384</td><td>65,534</td><td>Medium orgs. Private: 172.16-31.x.x</td></tr>
<tr><td><strong>C</strong></td><td>192.0.0.0 – 223.255.255.255</td><td>255.255.255.0 (/24)</td><td>2,097,152</td><td>254</td><td>Small orgs. Private: 192.168.x.x</td></tr>
<tr><td><strong>D</strong></td><td>224.0.0.0 – 239.255.255.255</td><td>N/A</td><td>N/A</td><td>N/A</td><td><strong>Multicast</strong> only. OSPF, IPTV, video conf.</td></tr>
<tr><td><strong>E</strong></td><td>240.0.0.0 – 255.255.255.255</td><td>N/A</td><td>N/A</td><td>N/A</td><td><strong>Reserved</strong> experimental. Not in production.</td></tr>
</table>

<h2>5.1 Special Addresses</h2>
<table>
<tr><th>Address</th><th>Meaning</th></tr>
<tr><td>0.0.0.0</td><td>This host on this network (unknown source)</td></tr>
<tr><td>127.0.0.1</td><td>Loopback (localhost) — test own TCP/IP stack</td></tr>
<tr><td>255.255.255.255</td><td>Limited broadcast (this network)</td></tr>
<tr><td>x.x.x.0</td><td>Network address (host bits all 0)</td></tr>
<tr><td>x.x.x.255</td><td>Directed broadcast for that network (host bits all 1)</td></tr>
<tr><td>169.254.x.x</td><td>APIPA — auto-assigned when DHCP fails</td></tr>
</table>

<h2>5.2 Private IP Ranges (RFC 1918)</h2>
<table>
<tr><th>Class</th><th>Range</th><th>CIDR</th></tr>
<tr><td>A</td><td>10.0.0.0 – 10.255.255.255</td><td>/8</td></tr>
<tr><td>B</td><td>172.16.0.0 – 172.31.255.255</td><td>/12</td></tr>
<tr><td>C</td><td>192.168.0.0 – 192.168.255.255</td><td>/16</td></tr>
</table>
<p>Not routable on public internet. NAT at gateway translates to public IP.</p>

<h1>6. Subnetting — Complete Guide</h1>

<h2>6.1 Why Subnet?</h2>
<ul>
<li>Reduce broadcast domain size</li>
<li>Security isolation (HR ≠ Engineering subnet)</li>
<li>Efficient IP allocation</li>
<li>Simplified routing</li>
</ul>

<h2>6.2 Key Formulas</h2>
<div class="formula">Number of subnets  = 2^(subnet bits borrowed)
Hosts per subnet   = 2^(host bits) - 2
                     (-2: network address + broadcast address)
Block size         = 2^(host bits)</div>

<h2>6.3 Common CIDR Reference</h2>
<table>
<tr><th>CIDR</th><th>Subnet Mask</th><th>Hosts</th><th>Subnets of /24</th></tr>
<tr><td>/24</td><td>255.255.255.0</td><td>254</td><td>1</td></tr>
<tr><td>/25</td><td>255.255.255.128</td><td>126</td><td>2</td></tr>
<tr><td>/26</td><td>255.255.255.192</td><td>62</td><td>4</td></tr>
<tr><td>/27</td><td>255.255.255.224</td><td>30</td><td>8</td></tr>
<tr><td>/28</td><td>255.255.255.240</td><td>14</td><td>16</td></tr>
<tr><td>/29</td><td>255.255.255.248</td><td>6</td><td>32</td></tr>
<tr><td>/30</td><td>255.255.255.252</td><td>2</td><td>64 (point-to-point links)</td></tr>
<tr><td>/32</td><td>255.255.255.255</td><td>0</td><td>Host route</td></tr>
</table>

<h2>6.4 Worked Example — Divide /24 into 4 Subnets</h2>
<p><strong>Task:</strong> Divide 192.168.1.0/24 into 4 equal subnets.</p>
<ol>
<li>4 subnets = 2<sup>2</sup> → borrow 2 bits → new prefix /26</li>
<li>New mask: 255.255.255.192</li>
<li>Block size: 2<sup>6</sup> = 64</li>
</ol>
<table>
<tr><th>Subnet</th><th>Network Address</th><th>First Host</th><th>Last Host</th><th>Broadcast</th></tr>
<tr><td>1</td><td>192.168.1.0/26</td><td>192.168.1.1</td><td>192.168.1.62</td><td>192.168.1.63</td></tr>
<tr><td>2</td><td>192.168.1.64/26</td><td>192.168.1.65</td><td>192.168.1.126</td><td>192.168.1.127</td></tr>
<tr><td>3</td><td>192.168.1.128/26</td><td>192.168.1.129</td><td>192.168.1.190</td><td>192.168.1.191</td></tr>
<tr><td>4</td><td>192.168.1.192/26</td><td>192.168.1.193</td><td>192.168.1.254</td><td>192.168.1.255</td></tr>
</table>
<p>Hosts per subnet: 2<sup>6</sup> - 2 = <strong>62</strong>.</p>

<h2>6.5 Find Subnet of an IP — Method</h2>
<p><strong>Which subnet does 192.168.1.100 belong to in /26?</strong></p>
<p>AND the IP with subnet mask:</p>
<pre>192.168.1.100   = 11000000.10101000.00000001.01100100
255.255.255.192 = 11111111.11111111.11111111.11000000
AND             = 11000000.10101000.00000001.01000000
                = 192.168.1.64</pre>
<p>Belongs to subnet 192.168.1.64/26. Broadcast = 192.168.1.127.</p>

<h2>6.6 VLSM (Variable Length Subnet Masking)</h2>
<p>Different subnets with different sizes based on actual need. Starting block: 192.168.1.0/24</p>
<table>
<tr><th>Department</th><th>Hosts Needed</th><th>Subnet Size</th><th>CIDR</th><th>Range</th></tr>
<tr><td>Engineering</td><td>50</td><td>/26 (62 hosts)</td><td>192.168.1.0/26</td><td>.0 – .63</td></tr>
<tr><td>Sales</td><td>25</td><td>/27 (30 hosts)</td><td>192.168.1.64/27</td><td>.64 – .95</td></tr>
<tr><td>HR</td><td>10</td><td>/28 (14 hosts)</td><td>192.168.1.96/28</td><td>.96 – .111</td></tr>
<tr><td>Link</td><td>2</td><td>/30 (2 hosts)</td><td>192.168.1.112/30</td><td>.112 – .115</td></tr>
</table>

<h2>6.7 Route Aggregation (Supernetting)</h2>
<p>Combine multiple networks into one summary route.</p>
<pre>192.168.0.0/24 + 192.168.1.0/24 + 192.168.2.0/24 + 192.168.3.0/24
Common bits: first 22 bits
Summary: 192.168.0.0/22  (covers .0 through .3.255)</pre>
<p>Router advertises one route instead of four. Internet runs on route aggregation.</p>

<h1>7. IPv6</h1>
<p>128-bit addresses. 2<sup>128</sup> = 3.4 × 10<sup>38</sup> addresses.</p>
<pre>2001:0db8:85a3:0000:0000:8a2e:0370:7334
Shortened: 2001:db8:85a3::8a2e:370:7334</pre>
<p><strong>Shortening rules:</strong> drop leading zeros in group. Replace one run of all-zero groups with :: (only once).</p>
<table>
<tr><th>Address</th><th>Meaning</th></tr>
<tr><td>::1</td><td>Loopback (equiv to 127.0.0.1)</td></tr>
<tr><td>fe80::/10</td><td>Link-local (auto-configured, not routable)</td></tr>
<tr><td>ff00::/8</td><td>Multicast</td></tr>
</table>
<p><strong>IPv6 advantages:</strong> no broadcast (only multicast), mandatory IPSec, SLAAC (stateless auto-config), no fragmentation at routers, larger but simpler fixed 40-byte header.</p>

<h1>8. NAT (Network Address Translation)</h1>
<p>Private IPs not routable on internet. NAT at router translates.</p>
<ol>
<li>Inside host 192.168.1.5:3456 → 8.8.8.8:53</li>
<li>Router replaces source with public IP:port: 203.0.113.1:40000</li>
<li>Stores mapping in NAT table</li>
<li>Reply comes to 203.0.113.1:40000</li>
<li>Router translates back to 192.168.1.5:3456</li>
</ol>
<table>
<tr><th>NAT Type</th><th>Mapping</th><th>Use</th></tr>
<tr><td>Static NAT</td><td>1 private ↔ 1 public</td><td>Servers needing fixed public IP</td></tr>
<tr><td>Dynamic NAT</td><td>Pool of public IPs, dynamic assignment</td><td>Organizations with IP pool</td></tr>
<tr><td>PAT (NAT Overload)</td><td>Many private → 1 public (port-based)</td><td>Home routers — standard</td></tr>
</table>

<h1>9. DNS — Domain Name System</h1>
<p>Internet's phone book. Translates human-readable names to IP addresses.</p>

<h2>9.1 Resolution Process for www.google.com</h2>
<ol>
<li>Browser cache → OS cache → /etc/hosts check</li>
<li>Ask Recursive Resolver (ISP or 8.8.8.8)</li>
<li>Resolver asks Root Nameserver → "Ask .com NS at x.x.x.x"</li>
<li>Resolver asks .com NS → "Ask google.com NS at y.y.y.y"</li>
<li>Resolver asks Google's authoritative NS → "It's 142.250.67.68"</li>
<li>Resolver caches (per TTL), returns to client</li>
</ol>

<h2>9.2 DNS Record Types</h2>
<table>
<tr><th>Record</th><th>Purpose</th><th>Example</th></tr>
<tr><td>A</td><td>IPv4 address</td><td>google.com → 142.250.67.68</td></tr>
<tr><td>AAAA</td><td>IPv6 address</td><td>google.com → 2404:6800:...</td></tr>
<tr><td>CNAME</td><td>Alias to another name</td><td>www.google.com → google.com</td></tr>
<tr><td>MX</td><td>Mail server</td><td>google.com → smtp.google.com</td></tr>
<tr><td>NS</td><td>Authoritative nameserver</td><td>google.com → ns1.google.com</td></tr>
<tr><td>TXT</td><td>Arbitrary text</td><td>SPF, domain verification</td></tr>
<tr><td>PTR</td><td>Reverse lookup IP → name</td><td>142.250.67.68 → google.com</td></tr>
<tr><td>SOA</td><td>Zone metadata</td><td>Serial, refresh, retry times</td></tr>
</table>

<h1>10. HTTP and HTTPS</h1>

<h2>10.1 HTTP Methods</h2>
<table>
<tr><th>Method</th><th>Purpose</th><th>Idempotent</th><th>Has Body</th></tr>
<tr><td>GET</td><td>Retrieve resource</td><td>Yes</td><td>No</td></tr>
<tr><td>POST</td><td>Create resource</td><td>No</td><td>Yes</td></tr>
<tr><td>PUT</td><td>Replace resource</td><td>Yes</td><td>Yes</td></tr>
<tr><td>PATCH</td><td>Partial update</td><td>No</td><td>Yes</td></tr>
<tr><td>DELETE</td><td>Delete resource</td><td>Yes</td><td>No</td></tr>
<tr><td>HEAD</td><td>GET but no response body</td><td>Yes</td><td>No</td></tr>
<tr><td>OPTIONS</td><td>Query supported methods</td><td>Yes</td><td>No</td></tr>
</table>

<h2>10.2 Status Codes</h2>
<table>
<tr><th>Range</th><th>Category</th><th>Key Codes</th></tr>
<tr><td>1xx</td><td>Informational</td><td>100 Continue</td></tr>
<tr><td>2xx</td><td>Success</td><td>200 OK, 201 Created, 204 No Content</td></tr>
<tr><td>3xx</td><td>Redirect</td><td>301 Moved Permanently, 302 Found, 304 Not Modified</td></tr>
<tr><td>4xx</td><td>Client Error</td><td>400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 429 Too Many Requests</td></tr>
<tr><td>5xx</td><td>Server Error</td><td>500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout</td></tr>
</table>

<h2>10.3 HTTP Versions</h2>
<table>
<tr><th>Version</th><th>Key Feature</th><th>Problem Solved</th></tr>
<tr><td>HTTP/1.0</td><td>One request per connection</td><td>—</td></tr>
<tr><td>HTTP/1.1</td><td>Persistent connections, pipelining</td><td>Connection overhead</td></tr>
<tr><td>HTTP/2</td><td>Binary framing, multiplexing, HPACK header compression, server push</td><td>Head-of-line blocking per connection</td></tr>
<tr><td>HTTP/3</td><td>QUIC (UDP-based), built-in TLS 1.3, 0-RTT reconnect</td><td>TCP head-of-line blocking</td></tr>
</table>

<h2>10.4 TLS Handshake (TLS 1.3)</h2>
<ol>
<li>Client sends: supported ciphers, random nonce, DH public key</li>
<li>Server sends: chosen cipher, certificate, DH public key, encrypted finished</li>
<li>Client verifies cert (CA chain), derives session key from DH exchange</li>
<li>Both have symmetric key — all further traffic encrypted</li>
</ol>
<p>One round trip (1-RTT). 0-RTT possible for resumed sessions.</p>

<h1>11. Networking Devices</h1>
<table>
<tr><th>Device</th><th>OSI Layer</th><th>Function</th></tr>
<tr><td>Hub</td><td>L1</td><td>Broadcasts bits to all ports. All ports = one collision domain. Obsolete.</td></tr>
<tr><td>Switch</td><td>L2</td><td>Forwards frames by MAC. Learns MAC table. Full-duplex. Each port = own collision domain.</td></tr>
<tr><td>Router</td><td>L3</td><td>Routes packets between networks using IP. Connects LAN to WAN.</td></tr>
<tr><td>Bridge</td><td>L2</td><td>Connects two LAN segments, filters by MAC.</td></tr>
<tr><td>Gateway</td><td>L4-L7</td><td>Protocol conversion. Default gateway = your subnet's router.</td></tr>
<tr><td>Load Balancer</td><td>L4/L7</td><td>Distributes traffic across servers.</td></tr>
<tr><td>Firewall</td><td>L3-L7</td><td>Traffic filtering by rules.</td></tr>
<tr><td>Proxy</td><td>L7</td><td>Forward: client → internet. Reverse: internet → backend.</td></tr>
<tr><td>Repeater</td><td>L1</td><td>Amplifies signal to extend range.</td></tr>
<tr><td>Modem</td><td>L1-L2</td><td>Digital ↔ analog conversion (DSL/cable).</td></tr>
<tr><td>Access Point</td><td>L2</td><td>WiFi bridge to wired LAN.</td></tr>
</table>

<h1>12. Key Ports Reference</h1>
<table>
<tr><th>Port</th><th>Protocol</th><th>Service</th></tr>
<tr><td>20</td><td>TCP</td><td>FTP Data</td></tr>
<tr><td>21</td><td>TCP</td><td>FTP Control</td></tr>
<tr><td>22</td><td>TCP</td><td>SSH</td></tr>
<tr><td>23</td><td>TCP</td><td>Telnet (insecure, avoid)</td></tr>
<tr><td>25</td><td>TCP</td><td>SMTP</td></tr>
<tr><td>53</td><td>TCP/UDP</td><td>DNS</td></tr>
<tr><td>67/68</td><td>UDP</td><td>DHCP server/client</td></tr>
<tr><td>80</td><td>TCP</td><td>HTTP</td></tr>
<tr><td>110</td><td>TCP</td><td>POP3</td></tr>
<tr><td>143</td><td>TCP</td><td>IMAP</td></tr>
<tr><td>161/162</td><td>UDP</td><td>SNMP</td></tr>
<tr><td>443</td><td>TCP</td><td>HTTPS</td></tr>
<tr><td>587</td><td>TCP</td><td>SMTP (submission)</td></tr>
<tr><td>993</td><td>TCP</td><td>IMAPS</td></tr>
<tr><td>995</td><td>TCP</td><td>POP3S</td></tr>
<tr><td>3306</td><td>TCP</td><td>MySQL</td></tr>
<tr><td>5432</td><td>TCP</td><td>PostgreSQL</td></tr>
<tr><td>6379</td><td>TCP</td><td>Redis</td></tr>
<tr><td>27017</td><td>TCP</td><td>MongoDB</td></tr>
</table>

<h1>13. Network Security</h1>
<table>
<tr><th>Attack</th><th>Type</th><th>Description</th><th>Defense</th></tr>
<tr><td>Packet Sniffing</td><td>Passive</td><td>Capture traffic on shared medium</td><td>TLS encryption</td></tr>
<tr><td>MITM</td><td>Active</td><td>Intercept + modify communication</td><td>TLS cert pinning, HSTS</td></tr>
<tr><td>ARP Poisoning</td><td>Active</td><td>Fake ARP replies → redirect traffic</td><td>Dynamic ARP Inspection, VLANs</td></tr>
<tr><td>DNS Poisoning</td><td>Active</td><td>Inject false DNS records into resolver cache</td><td>DNSSEC</td></tr>
<tr><td>DDoS</td><td>Active</td><td>Flood target with traffic. SYN flood, UDP flood.</td><td>Rate limiting, scrubbing centers</td></tr>
<tr><td>IP Spoofing</td><td>Active</td><td>Forge source IP</td><td>Ingress filtering (BCP38)</td></tr>
<tr><td>Replay</td><td>Active</td><td>Capture + resend valid auth packets</td><td>Nonces, timestamps, digital signatures</td></tr>
</table>

<h1>14. Complete Data Flow — Browser to Server</h1>
<p>When you type https://vidyapath.com and press Enter:</p>
<pre>1. DNS RESOLUTION
   Browser cache → OS cache → /etc/hosts → Recursive Resolver
   → Root NS → .com NS → vidyapath.com NS → IP address
   (UDP port 53)

2. TCP 3-WAY HANDSHAKE to IP:443
   SYN → SYN-ACK → ACK

3. TLS 1.3 HANDSHAKE
   ClientHello → ServerHello + Certificate + Finished
   Client verifies cert, both derive session key
   Encrypted session established

4. HTTP GET / (encrypted inside TLS)
   Browser → Nginx reverse proxy → Next.js server

5. SERVER PROCESSES, RETURNS HTML
   Browser parses → parallel DNS+TCP+TLS for CSS/JS/images
   JavaScript executes, makes API calls → page rendered

EACH ROUTER ALONG THE PATH:
  Strip L2 frame → Read L3 IP → Re-encapsulate in new L2 frame → Forward
  (Decrement TTL, drop if 0)</pre>

<p style="page-break-after:always;"></p>

<!-- ══════════════════ APPENDIX ══════════════════ -->
<h1>Appendix: Quick Reference Cheat Sheet</h1>

<h2>AI/ML Key Formulas</h2>
<table>
<tr><th>Concept</th><th>Formula</th></tr>
<tr><td>Attention</td><td>softmax(QK<sup>T</sup> / √dk) × V</td></tr>
<tr><td>Adam update</td><td>w ← w - η × m̂ / (√v̂ + ε)</td></tr>
<tr><td>Cross-Entropy</td><td>L = -Σ y × log(ŷ)</td></tr>
<tr><td>MSE</td><td>L = (1/n) Σ (ŷ - y)<sup>2</sup></td></tr>
<tr><td>BM25</td><td>Σ IDF(t) × (tf × (k1+1)) / (tf + k1×(1-b+b×dl/avgdl))</td></tr>
<tr><td>MMR</td><td>λ × relevance(d) - (1-λ) × max_sim(d, selected)</td></tr>
<tr><td>RRF</td><td>Σ 1/(k + rank_i) across lists</td></tr>
<tr><td>GRPO Advantage</td><td>(r_i - mean(r)) / std(r)</td></tr>
<tr><td>LoRA</td><td>W' = W + BA, rank r &lt;&lt; min(d,k)</td></tr>
</table>

<h2>DBMS Quick Reference</h2>
<table>
<tr><th>Normal Form</th><th>Eliminates</th></tr>
<tr><td>1NF</td><td>Non-atomic / multi-valued attributes</td></tr>
<tr><td>2NF</td><td>Partial dependencies (composite PK)</td></tr>
<tr><td>3NF</td><td>Transitive dependencies</td></tr>
<tr><td>BCNF</td><td>All FD violations (every determinant is super key)</td></tr>
<tr><td>4NF</td><td>Multi-valued dependencies</td></tr>
</table>
<table>
<tr><th>ACID Property</th><th>One-line Definition</th></tr>
<tr><td>Atomicity</td><td>All or nothing</td></tr>
<tr><td>Consistency</td><td>Valid state to valid state</td></tr>
<tr><td>Isolation</td><td>Concurrent = serial</td></tr>
<tr><td>Durability</td><td>Committed = persists forever</td></tr>
</table>

<h2>Networking Quick Reference</h2>
<table>
<tr><th>Subnetting Formula</th><th>Value</th></tr>
<tr><td>Subnets</td><td>2^(borrowed bits)</td></tr>
<tr><td>Hosts per subnet</td><td>2^(host bits) - 2</td></tr>
<tr><td>Block size</td><td>2^(host bits)</td></tr>
<tr><td>Find subnet</td><td>IP AND subnet mask</td></tr>
</table>
<table>
<tr><th>Class</th><th>First Octet Range</th><th>Default /</th><th>Private Range</th></tr>
<tr><td>A</td><td>1–126</td><td>/8</td><td>10.x.x.x</td></tr>
<tr><td>B</td><td>128–191</td><td>/16</td><td>172.16-31.x.x</td></tr>
<tr><td>C</td><td>192–223</td><td>/24</td><td>192.168.x.x</td></tr>
<tr><td>D</td><td>224–239</td><td>N/A</td><td>Multicast</td></tr>
<tr><td>E</td><td>240–255</td><td>N/A</td><td>Reserved</td></tr>
</table>

</body>
</html>
"""

def build_pdf(html: str, css: str, out_path: str) -> None:
    story = fitz.Story(html=html, user_css=css, em=11)

    # A4 page with margins
    MEDIABOX = fitz.paper_rect("a4")
    WHERE = MEDIABOX + (36, 36, -36, -36)  # 1.27cm margins

    writer = fitz.DocumentWriter(out_path)
    more = True

    while more:
        device = writer.begin_page(MEDIABOX)
        more, _ = story.place(WHERE)
        story.draw(device)
        writer.end_page()

    writer.close()
    print(f"PDF written: {out_path}")

    # Verify
    doc = fitz.open(out_path)
    size_kb = round(os.path.getsize(out_path) / 1024)
    print(f"Pages: {doc.page_count} | Size: {size_kb} KB")
    doc.close()

if __name__ == "__main__":
    build_pdf(HTML, CSS, OUT_PATH)

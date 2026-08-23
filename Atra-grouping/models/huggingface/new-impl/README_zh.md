---
license: apache-2.0
---

[English](./README.md) | **中文**

[Arxiv PDF](https://arxiv.org/pdf/2407.19669), [HF paper page](https://huggingface.co/papers/2407.19669)

## GTE 新模型代码实现

此模型为 BERT-like 编码器模型，加入了以下优化：

1. 使用 RoPE [^1] 旋转位置编码替换 absolute position embedding。
2. 使用 GLU (Gated Linear Unit) [^2] 替换普通的激活函数。
3. 设置 attention dropout 为 0 以方便应用 `xformers` 和 `flash_attn` 等优化。
4. 使用 Unpadding 技术去除对 padding token 的无用计算 [^3]（默认关闭，需要结合 `flash_attn` 或 `xformers` 使用来获得最高加速）。


### 推荐：启用 Unpadding 和 xformers 加速

此代码支持使用 `xformers` 加速 attention 计算，可以根据设备类型自动选择优化实现，比如 `flash_attn`。通过 `xformers`，在不能支持 `flash_attn` 的旧设备比如`V100`上也可以获得极大的加速。

首先，安装 `xformers`（需要预先安装`pytorch`）：
```
if pytorch 使用 conda 安装 :
    conda install xformers -c xformers

elif pytorch 使用 pip 安装 :
    # cuda 11.8 version
    pip3 install -U xformers --index-url https://download.pytorch.org/whl/cu118
    # cuda 12.1 version
    pip3 install -U xformers --index-url https://download.pytorch.org/whl/cu121
```
更多信息可参考 [installing-xformers](https://github.com/facebookresearch/xformers?tab=readme-ov-file#installing-xformers)。

然后，加载模型时设置 `unpad_inputs` 和 `use_memory_efficient_attention` 为 `true`，并设置 `torch_dtype` 为 `torch.float16` (or `torch.bfloat16`)，即可获得加速。

```python
import torch
from transformers import AutoModel, AutoTokenizer

path = 'Alibaba-NLP/gte-base-en-v1.5'
device = torch.device('cuda')
tokenzier = AutoTokenizer.from_pretrained(path)
model = AutoModel.from_pretrained(
    path,
    trust_remote_code=True,
    unpad_inputs=True,
    use_memory_efficient_attention=True,
    torch_dtype=torch.float16
).to(device)

inputs = tokenzier(['test input'], truncation=True, max_length=8192, padding=True, return_tensors='pt')

with torch.inference_mode():
    outputs = model(**inputs.to(device))

```
也可以直接修改模型的 `config.json` 中 `unpad_inputs` 和 `use_memory_efficient_attention` 为 `true`，省去代码中的设置。


---

<details>
  <summary> 与 nomic-embed 和 nomicBERT 的关系 </summary>

可能有人会质疑我们的原创性，认为这只是对 `nomicBERT` 的复刻。
在此澄清，我们是工作与 `nomicBERT` 平行并源自相同的想法。

应用 RoPE 和 GLU 到 BERT 上支持长文本是一个简单直接的想法。我们从2023年8月开始了探索。在2023年11月，完成了 `gte-base-en-v1.1` 的开发，然后我去忙别的课题的ACL投稿了。

`nomic-embed` [^4] 的发布让我们感受到了压力，也获得了更多资源得以加速继续开发这一项目。如果没有 `nomicai` 的杰出工作，`gte-v1.5` 系列可能还要延期很久。感谢！

</details>

---


## Citation
```
@misc{zhang2024mgte,
  title={mGTE: Generalized Long-Context Text Representation and Reranking Models for Multilingual Text Retrieval}, 
  author={Xin Zhang and Yanzhao Zhang and Dingkun Long and Wen Xie and Ziqi Dai and Jialong Tang and Huan Lin and Baosong Yang and Pengjun Xie and Fei Huang and Meishan Zhang and Wenjie Li and Min Zhang},
  year={2024},
  eprint={2407.19669},
  archivePrefix={arXiv},
  primaryClass={cs.CL},
  url={https://arxiv.org/abs/2407.19669}, 
}
```


[^1]: Su, Jianlin, Murtadha Ahmed, Yu Lu, Shengfeng Pan, Wen Bo, and Yunfeng Liu. "Roformer: Enhanced transformer with rotary position embedding." Neurocomputing 568 (2024): 127063.

[^2]: Shazeer, Noam. "Glu variants improve transformer." arXiv preprint arXiv:2002.05202 (2020).

[^3]: Portes, Jacob, Alexander Trott, Sam Havens, Daniel King, Abhinav Venigalla, Moin Nadeem, Nikhil Sardana, Daya Khudia, and Jonathan Frankle. "MosaicBERT: A Bidirectional Encoder Optimized for Fast Pretraining." Advances in Neural Information Processing Systems 36 (2024).

[^4]: Nussbaum, Zach, John X. Morris, Brandon Duderstadt, and Andriy Mulyar. "Nomic Embed: Training a Reproducible Long Context Text Embedder." arXiv preprint arXiv:2402.01613 (2024).
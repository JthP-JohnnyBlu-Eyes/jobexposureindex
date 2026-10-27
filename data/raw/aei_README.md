---
language: en
pretty_name: EconomicIndex
tags:
- AI
- LLM
- Economic Impacts
- Anthropic
license: mit
viewer: true
configs:
- config_name: release_2026_01_15
  data_files:
  - split: raw_claude_ai
    path: "release_2026_01_15/data/intermediate/aei_raw_claude_ai_2025-11-13_to_2025-11-20.csv"
  - split: raw_1p_api
    path: "release_2025_09_15/data/intermediate/aei_raw_1p_api_2025-11-13_to_2025-11-20.csv"
---


# The Anthropic Economic Index

## Overview

The Anthropic Economic Index provides insights into how AI is being incorporated into real-world tasks across the modern economy.

## Data Releases

This repository contains multiple data releases, each with its own documentation:

- **[Labor market impacts](https://huggingface.co/datasets/Anthropic/EconomicIndex/tree/main/labor_market_impacts)**: Job exposure and task penetration data
- **[Robot Exposure](https://huggingface.co/datasets/Anthropic/EconomicIndex/tree/main/robot_exposure)**: Job and task exposure to robots
- **[2026-06-26 Release](https://huggingface.co/datasets/Anthropic/EconomicIndex/tree/main/release_2026_06_26)**: Updated analysis with Artifacts and monthly aggregates
- **[2026-03-24 Release](https://huggingface.co/datasets/Anthropic/EconomicIndex/tree/main/release_2026_03_24)**: Updated analysis with Opus 4.5/4.6 and learning curves
- **[2026-01-15 Release](https://huggingface.co/datasets/Anthropic/EconomicIndex/tree/main/release_2026_01_15)**: Updated analysis with economic primitives and Sonnet 4.5
- **[2025-09-15 Release](https://huggingface.co/datasets/Anthropic/EconomicIndex/tree/main/release_2025_09_15)**: Updated analysis with geographic and first-party API data using Sonnet 4
- **[2025-03-27 Release](https://huggingface.co/datasets/Anthropic/EconomicIndex/tree/main/release_2025_03_27)**: Updated analysis with Claude 3.7 Sonnet data and cluster-level insights
- **[2025-02-10 Release](https://huggingface.co/datasets/Anthropic/EconomicIndex/tree/main/release_2025_02_10)**: Initial release with O*NET task mappings, automation vs. augmentation data, and more


## Resources

- [Index Home Page](https://www.anthropic.com/economic-index)
- [6th report](https://www.anthropic.com/research/economic-index-june-2026-report)
- [5th report](https://www.anthropic.com/research/economic-index-march-2026-report)
- [4th report](https://www.anthropic.com/research/anthropic-economic-index-january-2026-report)
- [3rd report](https://www.anthropic.com/research/anthropic-economic-index-september-2025-report)
- [2nd report](https://www.anthropic.com/news/anthropic-economic-index-insights-from-claude-sonnet-3-7)
- [1st report](https://www.anthropic.com/news/the-anthropic-economic-index)

- [What work can robots do?](https://www.anthropic.com/research/what-work-can-robots-do)
- [Labor market impacts](https://www.anthropic.com/research/labor-market-impacts)

## License

Data released under CC-BY, code released under MIT License.

## Contact

For press inquiries, contact press@anthropic.com. For all other questions, reach out to econ-research@anthropic.com.

## Citation

### Sixth release
```
@online{anthropic2026aeiv6,
        author = {Maxim Massenkoff and Eva Lyubich and Szymon Sacher and Zoe Hitzig and Shaoyi Zhang and Ryan Heller and Peter McCrory},
        title = {Anthropic Economic Index report: Cadences},
        date = {2026-06-26},
        year = {2026},
        url = {https://www.anthropic.com/research/economic-index-june-2026-report},
}

### Fifth release

```
@online{anthropic2026aeiv5,
        author = {Maxim Massenkoff and Eva Lyubich and Peter McCrory and Ruth Appel and Ryan Heller},
        title = {Anthropic Economic Index report: Learning curves},
        date = {2026-03-24},
        year = {2026},
        url = {https://www.anthropic.com/research/economic-index-march-2026-report},
}
```

### Fourth release

```
@online{anthropic2026aeiv4,
        author = {Ruth Appel and Maxim Massenkoff and Peter McCrory and Miles McCain and Ryan Heller and Tyler Neylon and Alex Tamkin},
        title = {Anthropic Economic Index report: economic primitives},
        date = {2026-01-15},
        year = {2026},
        url = {https://www.anthropic.com/research/anthropic-economic-index-january-2026-report},
}
```

### Third release

```
@online{appelmccrorytamkin2025geoapi,
        author = {Ruth Appel and Peter McCrory and Alex Tamkin and Michael Stern and Miles McCain and Tyler Neylon},
        title = {Anthropic Economic Index Report: Uneven Geographic and Enterprise AI Adoption},
        date = {2025-09-15},
        year = {2025},
        url = {www.anthropic.com/research/anthropic-economic-index-september-2025-report},
}
```

### Second release

```
@misc{handa2025economictasksperformedai,
      title={Which Economic Tasks are Performed with AI? Evidence from Millions of Claude Conversations}, 
      author={Kunal Handa and Alex Tamkin and Miles McCain and Saffron Huang and Esin Durmus and Sarah Heck and Jared Mueller and Jerry Hong and Stuart Ritchie and Tim Belonax and Kevin K. Troy and Dario Amodei and Jared Kaplan and Jack Clark and Deep Ganguli},
      year={2025},
      eprint={2503.04761},
      archivePrefix={arXiv},
      primaryClass={cs.CY},
      url={https://arxiv.org/abs/2503.04761}, 
}
```
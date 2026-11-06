package service

import (
	"fmt"
	"math/rand"
)

// Small fixed word lists for random readable visualization names
// (~20 × 20 × 100 combinations; collisions are retried by the caller).
var (
	vizAdjectives = []string{
		"brave", "calm", "clever", "eager", "fuzzy",
		"gentle", "happy", "jolly", "lucky", "merry",
		"proud", "quiet", "silly", "smooth", "sunny",
		"swift", "tidy", "warm", "wise", "zesty",
	}
	vizAnimals = []string{
		"badger", "dolphin", "falcon", "fox", "gazelle",
		"heron", "ibex", "lynx", "marten", "narwhal",
		"osprey", "otter", "puma", "quokka", "raccoon",
		"salmon", "tiger", "vole", "walrus", "yak",
	}
)

// NewVizName generates a random readable visualization name
// (adjective-animal-NN) using the provided rand source.
func NewVizName(rng *rand.Rand) string {
	return fmt.Sprintf("%s-%s-%02d",
		vizAdjectives[rng.Intn(len(vizAdjectives))],
		vizAnimals[rng.Intn(len(vizAnimals))],
		rng.Intn(100))
}

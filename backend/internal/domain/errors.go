package domain

import "errors"

var (
	ErrNotFound        = errors.New("not found")
	ErrVersionConflict = errors.New("version conflict")
	// ErrAlreadyExists maps unique-constraint collisions (slice names) to 409.
	ErrAlreadyExists = errors.New("already exists")
)

package service

import (
	"context"
	"errors"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubSliceStore struct {
	createCalls int
	gotCreate   domain.Slice
	created     domain.Slice
	createErr   error

	byName domain.Slice
	getErr error

	listed  []domain.Slice
	listErr error

	renameCalls int
	gotRename   struct{ name, newName, description string }
	renamed     domain.Slice
	renameErr   error

	deleteCalls int
	deleteErr   error
}

func (s *stubSliceStore) CreateSlice(_ context.Context, graphID string, sl domain.Slice) (domain.Slice, error) {
	s.createCalls++
	s.gotCreate = sl
	if s.createErr != nil {
		return domain.Slice{}, s.createErr
	}
	return domain.Slice{ID: "sid-1", GraphID: graphID, Name: sl.Name, Description: sl.Description}, nil
}

func (s *stubSliceStore) GetSliceByName(_ context.Context, _, _ string) (domain.Slice, error) {
	return s.byName, s.getErr
}

func (s *stubSliceStore) ListSlices(_ context.Context, _ string) ([]domain.Slice, error) {
	return s.listed, s.listErr
}

func (s *stubSliceStore) RenameSlice(_ context.Context, _, name, newName, description string) (domain.Slice, error) {
	s.renameCalls++
	s.gotRename.name, s.gotRename.newName, s.gotRename.description = name, newName, description
	if s.renameErr != nil {
		return domain.Slice{}, s.renameErr
	}
	return s.renamed, nil
}

func (s *stubSliceStore) DeleteSlice(_ context.Context, _ string, _ string) error {
	s.deleteCalls++
	return s.deleteErr
}

type stubMembership struct {
	addCalls  int
	gotAddIDs []string
	gotAddSid string
	addCount  int
	addErr    error

	removeCalls  int
	gotRemoveIDs []string
	removeCount  int
	removeErr    error

	counts    map[string]int
	countsErr error

	sweepCalls int
	sweptSids  []string
	sweepErr   error
}

func (m *stubMembership) AddToSlice(_ context.Context, _, sliceID string, ids []string) (int, error) {
	m.addCalls++
	m.gotAddIDs = ids
	m.gotAddSid = sliceID
	return m.addCount, m.addErr
}

func (m *stubMembership) RemoveFromSlice(_ context.Context, _, _ string, ids []string) (int, error) {
	m.removeCalls++
	m.gotRemoveIDs = ids
	return m.removeCount, m.removeErr
}

func (m *stubMembership) SweepSlice(_ context.Context, _ string, sliceID string) error {
	m.sweepCalls++
	m.sweptSids = append(m.sweptSids, sliceID)
	return m.sweepErr
}

func (m *stubMembership) MemberCounts(_ context.Context, _ string) (map[string]int, error) {
	if m.counts == nil {
		return map[string]int{}, m.countsErr
	}
	return m.counts, m.countsErr
}

type stubSubgraphSource struct {
	sub domain.Subgraph
	err error
}

func (s *stubSubgraphSource) GetSubgraph(_ context.Context, _ string) (domain.Subgraph, error) {
	return s.sub, s.err
}

func newSliceService(store *stubSliceStore, members *stubMembership, graphs *stubGraphExistence, sub *stubSubgraphSource) *SliceService {
	return NewSliceService(store, members, graphs, sub)
}

func TestSliceService_Create(t *testing.T) {
	t.Run("blank name", func(t *testing.T) {
		store, members := &stubSliceStore{}, &stubMembership{}
		svc := newSliceService(store, members, &stubGraphExistence{}, &stubSubgraphSource{})
		_, err := svc.CreateSlice(context.Background(), "g1", "  ", "", nil)
		assert.ErrorIs(t, err, ErrInvalidInput)
		assert.Equal(t, 0, store.createCalls)
	})

	t.Run("unknown graph", func(t *testing.T) {
		store, members := &stubSliceStore{}, &stubMembership{}
		svc := newSliceService(store, members, &stubGraphExistence{err: domain.ErrNotFound}, &stubSubgraphSource{})
		_, err := svc.CreateSlice(context.Background(), "gX", "s", "", nil)
		assert.ErrorIs(t, err, domain.ErrNotFound)
		assert.Equal(t, 0, store.createCalls)
	})

	t.Run("name collision", func(t *testing.T) {
		store, members := &stubSliceStore{createErr: domain.ErrAlreadyExists}, &stubMembership{}
		svc := newSliceService(store, members, &stubGraphExistence{}, &stubSubgraphSource{})
		_, err := svc.CreateSlice(context.Background(), "g1", "dup", "", nil)
		assert.ErrorIs(t, err, domain.ErrAlreadyExists)
		assert.Equal(t, 0, members.addCalls)
	})

	t.Run("no node ids", func(t *testing.T) {
		store, members := &stubSliceStore{created: domain.Slice{ID: "sid-1"}}, &stubMembership{}
		svc := newSliceService(store, members, &stubGraphExistence{}, &stubSubgraphSource{})
		info, err := svc.CreateSlice(context.Background(), "g1", "focus", "desc", nil)
		require.NoError(t, err)
		assert.Equal(t, "sid-1", info.ID)
		assert.Equal(t, "focus", info.Name)
		assert.Equal(t, "desc", info.Description)
		assert.Equal(t, 0, info.NodeCount)
		assert.Equal(t, 0, members.addCalls) // no membership op without nodeIds
		assert.Equal(t, "desc", store.gotCreate.Description)
	})

	t.Run("with node ids reports actual count", func(t *testing.T) {
		store := &stubSliceStore{}
		members := &stubMembership{addCount: 2} // one of three ids unknown → 2 real
		svc := newSliceService(store, members, &stubGraphExistence{}, &stubSubgraphSource{})
		info, err := svc.CreateSlice(context.Background(), "g1", "focus", "", []string{"n1", "n2", "missing"})
		require.NoError(t, err)
		assert.Equal(t, 2, info.NodeCount) // actual, not len(nodeIds)
		assert.Equal(t, 1, members.addCalls)
		assert.Equal(t, "sid-1", members.gotAddSid) // membership keyed by the created slice's uuid
		assert.Equal(t, []string{"n1", "n2", "missing"}, members.gotAddIDs)
	})

	t.Run("membership add failure propagates", func(t *testing.T) {
		store := &stubSliceStore{}
		members := &stubMembership{addErr: errors.New("neo4j down")}
		svc := newSliceService(store, members, &stubGraphExistence{}, &stubSubgraphSource{})
		_, err := svc.CreateSlice(context.Background(), "g1", "focus", "", []string{"n1"})
		require.Error(t, err) // row stays; client retries the add (ApplyMutations precedent)
		assert.Equal(t, 1, store.createCalls)
	})
}

func TestSliceService_List(t *testing.T) {
	t.Run("unknown graph", func(t *testing.T) {
		svc := newSliceService(&stubSliceStore{}, &stubMembership{}, &stubGraphExistence{err: domain.ErrNotFound}, &stubSubgraphSource{})
		_, err := svc.ListSlices(context.Background(), "gX")
		assert.ErrorIs(t, err, domain.ErrNotFound)
	})

	t.Run("aggregates counts, zero for absent", func(t *testing.T) {
		store := &stubSliceStore{listed: []domain.Slice{
			{ID: "sid-a", Name: "a", Description: "da"},
			{ID: "sid-b", Name: "b"},
		}}
		members := &stubMembership{counts: map[string]int{"sid-a": 3}}
		svc := newSliceService(store, members, &stubGraphExistence{}, &stubSubgraphSource{})
		infos, err := svc.ListSlices(context.Background(), "g1")
		require.NoError(t, err)
		require.Len(t, infos, 2)
		assert.Equal(t, domain.SliceInfo{ID: "sid-a", Name: "a", Description: "da", NodeCount: 3}, infos[0])
		assert.Equal(t, domain.SliceInfo{ID: "sid-b", Name: "b", Description: "", NodeCount: 0}, infos[1])
	})

	t.Run("empty list is an empty slice, not nil", func(t *testing.T) {
		svc := newSliceService(&stubSliceStore{}, &stubMembership{}, &stubGraphExistence{}, &stubSubgraphSource{})
		infos, err := svc.ListSlices(context.Background(), "g1")
		require.NoError(t, err)
		require.NotNil(t, infos)
		assert.Empty(t, infos)
	})

	t.Run("counts error propagates", func(t *testing.T) {
		members := &stubMembership{countsErr: errors.New("boom")}
		svc := newSliceService(&stubSliceStore{}, members, &stubGraphExistence{}, &stubSubgraphSource{})
		_, err := svc.ListSlices(context.Background(), "g1")
		assert.Error(t, err)
	})
}

func TestSliceService_Get(t *testing.T) {
	t.Run("unknown graph", func(t *testing.T) {
		svc := newSliceService(&stubSliceStore{}, &stubMembership{}, &stubGraphExistence{err: domain.ErrNotFound}, &stubSubgraphSource{})
		_, err := svc.GetSlice(context.Background(), "gX", "s")
		assert.ErrorIs(t, err, domain.ErrNotFound)
	})

	t.Run("unknown slice", func(t *testing.T) {
		store := &stubSliceStore{getErr: domain.ErrNotFound}
		svc := newSliceService(store, &stubMembership{}, &stubGraphExistence{}, &stubSubgraphSource{})
		_, err := svc.GetSlice(context.Background(), "g1", "missing")
		assert.ErrorIs(t, err, domain.ErrNotFound)
	})

	t.Run("members hydrated from subgraph", func(t *testing.T) {
		store := &stubSliceStore{byName: domain.Slice{ID: "sid-2", Name: "focus", Description: "d"}}
		sub := &stubSubgraphSource{sub: domain.Subgraph{Nodes: []domain.Node{
			{ID: "n1", Type: "Task", SliceIDs: []string{"sid-1", "sid-2"}},
			{ID: "n2", Type: "Task", SliceIDs: []string{"sid-2"}},
			{ID: "n3", Type: "Task"}, // no membership → excluded
		}}}
		svc := newSliceService(store, &stubMembership{}, &stubGraphExistence{}, sub)
		detail, err := svc.GetSlice(context.Background(), "g1", "focus")
		require.NoError(t, err)
		assert.Equal(t, "sid-2", detail.ID)
		assert.Equal(t, "focus", detail.Name)
		assert.Equal(t, "d", detail.Description)
		require.Len(t, detail.Nodes, 2)
		assert.Equal(t, "n1", detail.Nodes[0].ID)
		assert.Equal(t, "n2", detail.Nodes[1].ID)
	})
}

func TestSliceService_Rename(t *testing.T) {
	current := domain.Slice{ID: "sid-1", Name: "old", Description: "od"}

	t.Run("unknown slice", func(t *testing.T) {
		store := &stubSliceStore{getErr: domain.ErrNotFound}
		svc := newSliceService(store, &stubMembership{}, &stubGraphExistence{}, &stubSubgraphSource{})
		_, err := svc.RenameSlice(context.Background(), "g1", "missing", nil, nil)
		assert.ErrorIs(t, err, domain.ErrNotFound)
		assert.Equal(t, 0, store.renameCalls)
	})

	t.Run("nil fields keep current values", func(t *testing.T) {
		store := &stubSliceStore{byName: current}
		svc := newSliceService(store, &stubMembership{}, &stubGraphExistence{}, &stubSubgraphSource{})
		_, err := svc.RenameSlice(context.Background(), "g1", "old", nil, nil)
		require.NoError(t, err)
		assert.Equal(t, "old", store.gotRename.newName)
		assert.Equal(t, "od", store.gotRename.description)
	})

	t.Run("name only keeps description", func(t *testing.T) {
		store := &stubSliceStore{byName: current}
		svc := newSliceService(store, &stubMembership{}, &stubGraphExistence{}, &stubSubgraphSource{})
		newName := "new"
		_, err := svc.RenameSlice(context.Background(), "g1", "old", &newName, nil)
		require.NoError(t, err)
		assert.Equal(t, "new", store.gotRename.newName)
		assert.Equal(t, "od", store.gotRename.description)
	})

	t.Run("description only keeps name", func(t *testing.T) {
		store := &stubSliceStore{byName: current}
		svc := newSliceService(store, &stubMembership{}, &stubGraphExistence{}, &stubSubgraphSource{})
		newDesc := "nd"
		_, err := svc.RenameSlice(context.Background(), "g1", "old", nil, &newDesc)
		require.NoError(t, err)
		assert.Equal(t, "old", store.gotRename.newName)
		assert.Equal(t, "nd", store.gotRename.description)
	})

	t.Run("blank resolved name rejected", func(t *testing.T) {
		store := &stubSliceStore{byName: current}
		svc := newSliceService(store, &stubMembership{}, &stubGraphExistence{}, &stubSubgraphSource{})
		blank := "  "
		_, err := svc.RenameSlice(context.Background(), "g1", "old", &blank, nil)
		assert.ErrorIs(t, err, ErrInvalidInput)
		assert.Equal(t, 0, store.renameCalls)
	})

	t.Run("collision maps to 409", func(t *testing.T) {
		store := &stubSliceStore{byName: current, renameErr: domain.ErrAlreadyExists}
		svc := newSliceService(store, &stubMembership{}, &stubGraphExistence{}, &stubSubgraphSource{})
		_, err := svc.RenameSlice(context.Background(), "g1", "old", nil, nil)
		assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	})
}

func TestSliceService_Delete(t *testing.T) {
	t.Run("unknown slice", func(t *testing.T) {
		store := &stubSliceStore{getErr: domain.ErrNotFound}
		members := &stubMembership{}
		svc := newSliceService(store, members, &stubGraphExistence{}, &stubSubgraphSource{})
		err := svc.DeleteSlice(context.Background(), "g1", "missing")
		assert.ErrorIs(t, err, domain.ErrNotFound)
		assert.Equal(t, 0, store.deleteCalls)
		assert.Equal(t, 0, members.sweepCalls)
	})

	t.Run("pg delete then best-effort sweep", func(t *testing.T) {
		store := &stubSliceStore{byName: domain.Slice{ID: "sid-1", Name: "old"}}
		members := &stubMembership{sweepErr: errors.New("neo4j down")}
		svc := newSliceService(store, members, &stubGraphExistence{}, &stubSubgraphSource{})
		err := svc.DeleteSlice(context.Background(), "g1", "old")
		require.NoError(t, err) // sweep failure still 204 (leftovers are inert)
		assert.Equal(t, 1, store.deleteCalls)
		assert.Equal(t, []string{"sid-1"}, members.sweptSids) // swept by uuid
	})

	t.Run("pg delete failure propagates, no sweep", func(t *testing.T) {
		store := &stubSliceStore{byName: domain.Slice{ID: "sid-1", Name: "old"}, deleteErr: errors.New("pg down")}
		members := &stubMembership{}
		svc := newSliceService(store, members, &stubGraphExistence{}, &stubSubgraphSource{})
		err := svc.DeleteSlice(context.Background(), "g1", "old")
		assert.Error(t, err)
		assert.Equal(t, 0, members.sweepCalls)
	})
}

func TestSliceService_AddRemoveNodes(t *testing.T) {
	t.Run("add unknown slice", func(t *testing.T) {
		store := &stubSliceStore{getErr: domain.ErrNotFound}
		members := &stubMembership{}
		svc := newSliceService(store, members, &stubGraphExistence{}, &stubSubgraphSource{})
		_, err := svc.AddSliceNodes(context.Background(), "g1", "missing", []string{"n1"})
		assert.ErrorIs(t, err, domain.ErrNotFound)
		assert.Equal(t, 0, members.addCalls)
	})

	t.Run("add passes slice uuid and ids", func(t *testing.T) {
		store := &stubSliceStore{byName: domain.Slice{ID: "sid-1", Name: "focus"}}
		members := &stubMembership{addCount: 4}
		svc := newSliceService(store, members, &stubGraphExistence{}, &stubSubgraphSource{})
		count, err := svc.AddSliceNodes(context.Background(), "g1", "focus", []string{"n1", "n2"})
		require.NoError(t, err)
		assert.Equal(t, 4, count)
		assert.Equal(t, "sid-1", members.gotAddSid)
		assert.Equal(t, []string{"n1", "n2"}, members.gotAddIDs)
	})

	t.Run("remove unknown slice", func(t *testing.T) {
		store := &stubSliceStore{getErr: domain.ErrNotFound}
		members := &stubMembership{}
		svc := newSliceService(store, members, &stubGraphExistence{}, &stubSubgraphSource{})
		_, err := svc.RemoveSliceNodes(context.Background(), "g1", "missing", []string{"n1"})
		assert.ErrorIs(t, err, domain.ErrNotFound)
		assert.Equal(t, 0, members.removeCalls)
	})

	t.Run("remove passes slice uuid and ids", func(t *testing.T) {
		store := &stubSliceStore{byName: domain.Slice{ID: "sid-1", Name: "focus"}}
		members := &stubMembership{removeCount: 1}
		svc := newSliceService(store, members, &stubGraphExistence{}, &stubSubgraphSource{})
		count, err := svc.RemoveSliceNodes(context.Background(), "g1", "focus", []string{"n1"})
		require.NoError(t, err)
		assert.Equal(t, 1, count)
		assert.Equal(t, []string{"n1"}, members.gotRemoveIDs)
	})
}

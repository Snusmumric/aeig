package neo4j

import (
	neo4jdriver "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

func NewDriver(uri, user, password string) (neo4jdriver.DriverWithContext, error) {
	return neo4jdriver.NewDriverWithContext(uri, neo4jdriver.BasicAuth(user, password, ""))
}

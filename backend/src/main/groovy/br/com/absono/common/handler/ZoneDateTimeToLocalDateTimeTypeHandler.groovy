package br.com.absono.common.handler

import org.apache.ibatis.type.BaseTypeHandler
import org.apache.ibatis.type.JdbcType
import org.apache.ibatis.type.MappedJdbcTypes
import org.apache.ibatis.type.MappedTypes

import java.sql.CallableStatement
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.sql.SQLException
import java.time.LocalDateTime
import java.time.OffsetDateTime

@MappedTypes(LocalDateTime)
@MappedJdbcTypes([JdbcType.TIMESTAMP, JdbcType.TIMESTAMP_WITH_TIMEZONE])
class ZoneDateTimeToLocalDateTimeTypeHandler extends BaseTypeHandler<LocalDateTime> {

    @Override
    void setNonNullParameter(PreparedStatement ps, int i, LocalDateTime parameter, JdbcType jdbcType) throws SQLException {
        ps.setObject(i, parameter)
    }

    @Override
    LocalDateTime getNullableResult(ResultSet rs, String columnName) throws SQLException {
        toLocalDateTime(rs.getObject(columnName))
    }

    @Override
    LocalDateTime getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        toLocalDateTime(rs.getObject(columnIndex))
    }

    @Override
    LocalDateTime getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        toLocalDateTime(cs.getObject(columnIndex))
    }

    private static LocalDateTime toLocalDateTime(Object value) {
        if (value == null) {
            return null
        }
        if (value instanceof LocalDateTime) {
            return (LocalDateTime) value
        }
        if (value instanceof OffsetDateTime) {
            return ((OffsetDateTime) value).toLocalDateTime()
        }
        if (value instanceof java.sql.Timestamp) {
            return ((java.sql.Timestamp) value).toLocalDateTime()
        }
        return null
    }
}
